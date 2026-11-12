//! mf-probe: can Media Foundation activate each video capture device?
//!
//! Prints one line per device and exits 1 if a device whose name contains the
//! first argument (default: "Ripsaw") fails to activate, 2 if no such device is
//! listed. It does NOT touch DirectShow, so it does not wake a card up: it is the
//! detector for the "cold" state (see scripts/repro-cold.ps1).

#[cfg(windows)]
fn main() {
    use windows::Win32::Media::MediaFoundation::*;
    use windows::Win32::System::Com::*;
    use windows::core::PWSTR;

    let wanted = std::env::args().nth(1).unwrap_or_else(|| "Ripsaw".into());
    let mut code = 2;
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().expect("CoInitializeEx");
        MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET).expect("MFStartup");
        let mut attr: Option<IMFAttributes> = None;
        MFCreateAttributes(&mut attr, 1).expect("MFCreateAttributes");
        let attr = attr.expect("attributes");
        attr.SetGUID(&MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE, &MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID)
            .expect("SetGUID");
        let mut list: *mut Option<IMFActivate> = std::ptr::null_mut();
        let mut count = 0u32;
        MFEnumDeviceSources(&attr, &mut list, &mut count).expect("MFEnumDeviceSources");
        let devices: Vec<IMFActivate> = if count == 0 {
            Vec::new()
        } else {
            std::slice::from_raw_parts(list, count as usize).iter().flatten().cloned().collect()
        };
        for (i, dev) in devices.iter().enumerate() {
            let mut p = PWSTR::null();
            let mut n = 0u32;
            let name = if dev.GetAllocatedString(&MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME, &mut p, &mut n).is_ok() {
                let s = p.to_string().unwrap_or_default();
                CoTaskMemFree(Some(p.0 as _));
                s
            } else {
                "?".into()
            };
            let result = match dev.ActivateObject::<IMFMediaSource>() {
                Ok(src) => {
                    let _ = src.Shutdown();
                    let _ = dev.ShutdownObject();
                    Ok(())
                }
                Err(e) => Err(e),
            };
            let ok = result.is_ok();
            match result {
                Ok(()) => println!("#{i} {:?}: OK", name.trim()),
                Err(e) => println!("#{i} {:?}: FAIL {e}", name.trim()),
            }
            if name.contains(&wanted) {
                code = if ok { 0 } else { 1 };
            }
        }
        let _ = MFShutdown();
    }
    std::process::exit(code);
}

#[cfg(not(windows))]
fn main() {
    eprintln!("mf-probe runs on Windows only");
    std::process::exit(2);
}
