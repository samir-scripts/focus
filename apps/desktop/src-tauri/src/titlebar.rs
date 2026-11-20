use std::error::Error;
use std::ptr::{null_mut, NonNull};

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSEventMask, NSView, NSWindow, NSWindowButton, NSWindowStyleMask};
use objc2_web_kit::WKWebView;
use tauri::Manager;

// Layout dimensions in CSS pixels, before the user applies page zoom.
const TOOLBAR_HEIGHT: f64 = 46.0;
const NAVIGATION_WIDTH: f64 = 124.0;

fn page_zoom(view: &NSView) -> Option<f64> {
    if let Some(webview) = view.downcast_ref::<WKWebView>() {
        // SAFETY: called from the AppKit mouse monitor on the main thread.
        return Some(unsafe { webview.pageZoom() });
    }
    view.subviews().iter().find_map(|child| page_zoom(&child))
}

fn inside_drag_region(x: f64, from_top: f64, width: f64, zoom: f64) -> bool {
    (0.0..TOOLBAR_HEIGHT * zoom).contains(&from_top) && x < width - NAVIGATION_WIDTH * zoom
}

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
        if !inside_drag_region(
            point.x - bounds.origin.x,
            from_top,
            bounds.size.width,
            page_zoom(&content).unwrap_or(1.0),
        )
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

#[cfg(test)]
mod tests {
    use super::inside_drag_region;

    #[test]
    fn separates_zoomed_navigation_and_content_from_draggable_toolbar() {
        for zoom in [0.8, 1.0, 2.0] {
            let boundary = 960.0 - 124.0 * zoom;
            assert!(inside_drag_region(boundary - 1.0, 45.0 * zoom, 960.0, zoom));
            assert!(!inside_drag_region(boundary, 23.0 * zoom, 960.0, zoom));
            assert!(!inside_drag_region(100.0, 46.0 * zoom, 960.0, zoom));
        }
    }
}
