//! Media Foundation refuses to activate ANY camera ("Element not found",
//! 0x80070490) when the calling .exe lives on a network path, e.g. when it is
//! started straight from WSL (`\\wsl.localhost\...\dist\hdmi-viewer.exe`): the
//! Windows camera stack cannot resolve the app's image path. So, when started
//! from such a path, copy the .exe to %LOCALAPPDATA%\hdmi-viewer and restart it
//! from there.

/// True for UNC / network paths (`\\server\share\...`, `\\wsl.localhost\...`,
/// `\\?\UNC\...`); false for local paths, including verbatim `\\?\C:\...`.
pub fn is_network_path(path: &str) -> bool {
    let p = path.replace('/', "\\");
    if let Some(rest) = p.strip_prefix(r"\\?\").or_else(|| p.strip_prefix(r"\\.\")) {
        return rest.len() >= 4 && rest[..4].eq_ignore_ascii_case(r"UNC\");
    }
    p.starts_with(r"\\")
}

/// If this .exe runs from a network path: copy it to a local folder, start the
/// copy with the same arguments and return true (the caller then exits).
#[cfg(windows)]
pub fn relaunch_from_local_disk() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    if !is_network_path(&exe.to_string_lossy()) {
        return false;
    }
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return false };
    let dir = std::path::Path::new(&base).join("hdmi-viewer");
    let _ = std::fs::create_dir_all(&dir);
    // The usual name, or a per-process one if an older copy is still running.
    let targets = [
        dir.join("hdmi-viewer.exe"),
        dir.join(format!("hdmi-viewer-{}.exe", std::process::id())),
    ];
    for target in targets {
        if std::fs::copy(&exe, &target).is_ok() {
            let args: Vec<_> = std::env::args_os().skip(1).collect();
            match std::process::Command::new(&target).args(args).spawn() {
                Ok(_) => {
                    log::info!("started from {}; relaunched as {}", exe.display(), target.display());
                    return true;
                }
                Err(e) => log::warn!("cannot start {}: {e}", target.display()),
            }
        }
    }
    log::warn!("running from a network path ({}); cameras will fail to open", exe.display());
    false
}

#[cfg(not(windows))]
pub fn relaunch_from_local_disk() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::is_network_path;

    #[test]
    fn network_paths() {
        for p in [
            r"\\wsl.localhost\Ubuntu-22.04\home\oriol\dist\hdmi-viewer.exe",
            r"\\wsl$\Ubuntu\home\x.exe",
            r"\\server\share\x.exe",
            r"\\?\UNC\wsl.localhost\Ubuntu\x.exe",
            r"\\?\unc\server\share\x.exe",
            "//server/share/x.exe",
        ] {
            assert!(is_network_path(p), "{p}");
        }
    }

    #[test]
    fn local_paths() {
        for p in [
            r"C:\Users\oriol\AppData\Local\Temp\hdmi-viewer.exe",
            r"D:\incoming\hdmi-viewer.exe",
            r"\\?\C:\tools\hdmi-viewer.exe",
            r"\\?\D:\x.exe",
            "relative\\x.exe",
        ] {
            assert!(!is_network_path(p), "{p}");
        }
    }
}
