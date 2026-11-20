use std::error::Error;
use std::ptr::{null_mut, NonNull};

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSEventMask, NSWindow, NSWindowButton, NSWindowStyleMask};
use tauri::Manager;

// Cocoa points match the macOS toolbar's logical CSS dimensions in App.svelte.
const TOOLBAR_HEIGHT: f64 = 46.0;
const NAVIGATION_WIDTH: f64 = 124.0;

pub(super) fn install(app: &tauri::App) -> Result<(), Box<dyn Error>> {
    let window = app.get_webview_window("main").ok_or("missing main window")?;
    // SAFETY: Tauri setup runs on the AppKit thread; the webview owns this NSWindow.
    let window_number = unsafe { &*window.ns_window()?.cast::<NSWindow>() }.windowNumber();
    let handler = RcBlock::new(move |ptr: NonNull<NSEvent>| {
        // SAFETY: AppKit supplies a valid mouse-down event for this callback.
        let event = unsafe { ptr.as_ref() };
        let mtm = MainThreadMarker::new().expect("AppKit local monitor runs on the main thread");
        if event.windowNumber() != window_number {
            return ptr.as_ptr();
        }
        let Some(window) = event.window(mtm) else {
            return ptr.as_ptr();
        };
        if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
            return ptr.as_ptr();
        }
        let Some(content) = window.contentView() else {
            return ptr.as_ptr();
        };
        let location = event.locationInWindow();
        let point = content.convertPoint_fromView(location, None);
        let bounds = content.bounds();
        let from_top = if content.isFlipped() {
            point.y - bounds.origin.y
        } else {
            bounds.origin.y + bounds.size.height - point.y
        };
        if !(0.0..TOOLBAR_HEIGHT).contains(&from_top)
            || point.x >= bounds.origin.x + bounds.size.width - NAVIGATION_WIDTH
            || [
                NSWindowButton::CloseButton,
                NSWindowButton::MiniaturizeButton,
                NSWindowButton::ZoomButton,
            ]
                .into_iter()
                .filter_map(|kind| window.standardWindowButton(kind))
                .any(|button| {
                    if button.isHiddenOrHasHiddenAncestor() {
                        return false;
                    }
                    let point = button.convertPoint_fromView(location, None);
                    let bounds = button.bounds();
                    (bounds.origin.x..bounds.origin.x + bounds.size.width).contains(&point.x)
                        && (bounds.origin.y..bounds.origin.y + bounds.size.height).contains(&point.y)
                })
        {
            return ptr.as_ptr();
        }

        // Use the original mouse-down, not NSApp.currentEvent after a WebKit IPC round trip.
        if event.clickCount() == 2 {
            window.performZoom(None);
        } else {
            window.performWindowDragWithEvent(event);
        }
        null_mut()
    });
    // SAFETY: The callback returns the incoming event or null to consume it.
    // AppKit owns the monitor for the lifetime of this single-window app.
    unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::LeftMouseDown, &handler) }
        .ok_or("could not install the title bar event monitor")?;
    Ok(())
}
