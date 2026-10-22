//! "Driver properties…": the capture card driver's own property pages (the same
//! dialog AMCap/OBS show). Media Foundation has no equivalent, so the device is
//! looked up by friendly name through DirectShow and `OleCreatePropertyFrame`
//! is shown on a dedicated STA thread (the dialog is modal and would otherwise
//! block the UI).

#[cfg(windows)]
pub fn show(device_name: String) -> std::sync::mpsc::Receiver<Result<(), String>> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(unsafe { imp::show(&device_name) }.map_err(|e| e.to_string()));
    });
    rx
}

#[cfg(not(windows))]
pub fn show(_device_name: String) -> std::sync::mpsc::Receiver<Result<(), String>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = tx.send(Err(
        "driver property pages are only available on Windows".into()
    ));
    rx
}

#[cfg(windows)]
mod imp {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Media::DirectShow::{IBaseFilter, ICreateDevEnum};
    use windows::Win32::Media::MediaFoundation::{
        CLSID_SystemDeviceEnum, CLSID_VideoInputDeviceCategory,
    };
    use windows::Win32::System::Com::StructuredStorage::IPropertyBag;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
        CoTaskMemFree, CoUninitialize, IEnumMoniker, IMoniker,
    };
    use windows::Win32::System::Ole::{ISpecifyPropertyPages, OleCreatePropertyFrame};
    use windows::Win32::System::Variant::{VARIANT, VT_BSTR, VariantClear};
    use windows::core::{Error, HSTRING, IUnknown, Interface, Result, w};

    pub unsafe fn show(device_name: &str) -> Result<()> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
            let r = show_inner(device_name);
            CoUninitialize();
            r
        }
    }

    unsafe fn show_inner(device_name: &str) -> Result<()> {
        unsafe {
            let filter = find_filter(device_name)?;
            let pages: ISpecifyPropertyPages = filter.cast()?;
            let cauuid = pages.GetPages()?;
            let unk: Option<IUnknown> = Some(filter.cast()?);
            let r = OleCreatePropertyFrame(
                HWND::default(),
                0,
                0,
                &HSTRING::from(device_name),
                1,
                &unk,
                cauuid.cElems,
                cauuid.pElems,
                0,
                None,
                None,
            );
            CoTaskMemFree(Some(cauuid.pElems as _));
            r
        }
    }

    unsafe fn find_filter(device_name: &str) -> Result<IBaseFilter> {
        unsafe {
            let dev_enum: ICreateDevEnum =
                CoCreateInstance(&CLSID_SystemDeviceEnum, None, CLSCTX_INPROC_SERVER)?;
            let mut monikers: Option<IEnumMoniker> = None;
            dev_enum.CreateClassEnumerator(&CLSID_VideoInputDeviceCategory, &mut monikers, 0)?;
            let monikers = monikers.ok_or_else(not_found)?;
            loop {
                let mut slot: [Option<IMoniker>; 1] = [None];
                if monikers.Next(&mut slot, None).is_err() {
                    break;
                }
                let Some(moniker) = slot[0].take() else { break };
                let bag: IPropertyBag = moniker.BindToStorage(None, None)?;
                let mut var = VARIANT::default();
                if bag.Read(w!("FriendlyName"), &mut var, None).is_ok() {
                    let v = &var.Anonymous.Anonymous;
                    let name = (v.vt == VT_BSTR).then(|| v.Anonymous.bstrVal.to_string());
                    let _ = VariantClear(&mut var);
                    if name.as_deref() == Some(device_name) {
                        return moniker.BindToObject(None, None);
                    }
                }
            }
            Err(not_found())
        }
    }

    fn not_found() -> Error {
        Error::new(
            windows::Win32::Foundation::E_FAIL,
            "device not found among DirectShow video inputs",
        )
    }
}
