use std::{collections::{HashMap, HashSet}, ptr::NonNull, sync::mpsc, time::Duration};

use block2::{DynBlock, RcBlock};
use focus_core::{db::Db, planner::Entry};
use objc2::{define_class, rc::{autoreleasepool, Retained}, runtime::{Bool, ProtocolObject}, ClassType};
use objc2_foundation::{NSArray, NSBundle, NSCalendar, NSCalendarIdentifierGregorian, NSCalendarUnit, NSDate, NSError, NSObject, NSObjectProtocol, NSString, NSTimeZone};
use objc2_user_notifications::{UNAuthorizationOptions, UNAuthorizationStatus, UNCalendarNotificationTrigger,
    UNMutableNotificationContent, UNNotification, UNNotificationPresentationOptions, UNNotificationRequest,
    UNNotificationSettings, UNUserNotificationCenter, UNUserNotificationCenterDelegate};
use uuid::Uuid;

use crate::planner::{now, AlertStatus, MUTATION};

const PREFIX: &str = "focus.planner.";
const CALLBACK: Duration = Duration::from_secs(5);

define_class!(
    #[unsafe(super(NSObject))]
    struct PlannerNotificationDelegate;
    unsafe impl NSObjectProtocol for PlannerNotificationDelegate {}
    unsafe impl UNUserNotificationCenterDelegate for PlannerNotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn present(&self, _: &UNUserNotificationCenter, _: &UNNotification,
            completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>) {
            completion.call((UNNotificationPresentationOptions::Banner | UNNotificationPresentationOptions::List,));
        }
    }
);

thread_local! {
    static DELEGATE: Retained<PlannerNotificationDelegate> = unsafe { objc2::msg_send![PlannerNotificationDelegate::class(), new] };
}

fn center() -> Option<Retained<UNUserNotificationCenter>> {
    // UserNotifications requires an application bundle; `cargo run` is unbundled.
    NSBundle::mainBundle().bundleIdentifier()?;
    Some(UNUserNotificationCenter::currentNotificationCenter())
}

pub(super) fn available() -> bool {
    NSBundle::mainBundle().bundleIdentifier().is_some()
}

pub(super) fn install() {
    if let Some(center) = center() {
        DELEGATE.with(|delegate| center.setDelegate(Some(ProtocolObject::from_ref(&**delegate))));
        tauri::async_runtime::spawn_blocking(|| {
            let Ok(_guard) = MUTATION.lock() else { return };
            let Ok(db) = Db::open_default() else { return };
            autoreleasepool(|_| reconcile(&db));
        });
    }
}

fn authorization(center: &UNUserNotificationCenter, prompt: bool) -> Result<bool, AlertStatus> {
    let (tx, rx) = mpsc::channel();
    let reply = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let _ = tx.send(unsafe { settings.as_ref() }.authorizationStatus());
    });
    center.getNotificationSettingsWithCompletionHandler(&reply);
    match rx.recv_timeout(CALLBACK).map_err(|_| AlertStatus::Failed)? {
        UNAuthorizationStatus::Authorized | UNAuthorizationStatus::Provisional => Ok(true),
        UNAuthorizationStatus::NotDetermined if prompt => {
            let (tx, rx) = mpsc::channel();
            let reply = RcBlock::new(move |allowed: Bool, error: *mut NSError| {
                let _ = tx.send(if error.is_null() { Ok(allowed.as_bool()) } else { Err(AlertStatus::Failed) });
            });
            center.requestAuthorizationWithOptions_completionHandler(UNAuthorizationOptions::Alert, &reply);
            rx.recv_timeout(Duration::from_secs(120)).map_err(|_| AlertStatus::Failed)?
        }
        _ => Ok(false),
    }
}

fn pending(center: &UNUserNotificationCenter) -> Result<HashSet<Uuid>, AlertStatus> {
    let (tx, rx) = mpsc::channel();
    let reply = RcBlock::new(move |requests: NonNull<NSArray<UNNotificationRequest>>| {
        let ids = unsafe { requests.as_ref() }.iter().filter_map(|request| {
            Uuid::parse_str(request.identifier().to_string().strip_prefix(PREFIX)?).ok()
        }).collect();
        let _ = tx.send(ids);
    });
    center.getPendingNotificationRequestsWithCompletionHandler(&reply);
    rx.recv_timeout(CALLBACK).map_err(|_| AlertStatus::Failed)
}

fn cancel(center: &UNUserNotificationCenter, id: Uuid) {
    center.removePendingNotificationRequestsWithIdentifiers(&NSArray::from_retained_slice(&[identifier(id)]));
}

fn identifier(id: Uuid) -> Retained<NSString> { NSString::from_str(&format!("{PREFIX}{id}")) }

fn register(center: &UNUserNotificationCenter, entry: &Entry, at: i64) -> AlertStatus {
    if at <= now() { cancel(center, entry.id); return AlertStatus::Elapsed; }
    let Some(calendar) = NSCalendar::calendarWithIdentifier(unsafe { NSCalendarIdentifierGregorian }) else { return AlertStatus::Failed };
    let utc = NSTimeZone::timeZoneForSecondsFromGMT(0);
    calendar.setTimeZone(&utc);
    let components = calendar.components_fromDate(
        NSCalendarUnit::Year | NSCalendarUnit::Month | NSCalendarUnit::Day | NSCalendarUnit::Hour | NSCalendarUnit::Minute | NSCalendarUnit::Second,
        &NSDate::dateWithTimeIntervalSince1970(at as f64),
    );
    components.setCalendar(Some(&calendar));
    components.setTimeZone(Some(&utc));
    let trigger = UNCalendarNotificationTrigger::triggerWithDateMatchingComponents_repeats(&components, false);
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(&entry.title));
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&identifier(entry.id), &content, Some(&trigger));
    let (tx, rx) = mpsc::channel();
    let reply = RcBlock::new(move |error: *mut NSError| { let _ = tx.send(error.is_null()); });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&reply));
    if rx.recv_timeout(CALLBACK) == Ok(true) { AlertStatus::Scheduled }
    else { cancel(center, entry.id); AlertStatus::Failed }
}

pub(super) fn update(id: Uuid, desired: Option<(&Entry, i64)>) -> Option<AlertStatus> {
    autoreleasepool(|_| {
        let Some(center) = center() else { return desired.map(|_| AlertStatus::Unavailable) };
        let Some((entry, at)) = desired else { cancel(&center, id); return None };
        // Cancel a superseded alert before a consent prompt can delay replacement.
        cancel(&center, id);
        Some(match authorization(&center, true) {
            Ok(true) => register(&center, entry, at),
            Ok(false) => AlertStatus::Denied,
            Err(status) => status,
        })
    })
}

pub(super) fn statuses(entries: Vec<Entry>) -> HashMap<Uuid, AlertStatus> {
    if !entries.iter().any(|entry| entry.lead.is_some()) { return HashMap::new(); }
    autoreleasepool(|_| {
        let current = center().ok_or(AlertStatus::Unavailable).and_then(|center| {
            if authorization(&center, false)? { pending(&center) } else { Err(AlertStatus::Denied) }
        });
        let now = now();
        entries.into_iter().filter_map(|entry| {
            let at = entry.reminder_at().ok().flatten()?;
            let status = if at <= now { AlertStatus::Elapsed } else { match &current {
                Ok(ids) if ids.contains(&entry.id) => AlertStatus::Scheduled,
                Ok(_) => AlertStatus::Failed,
                Err(status) => *status,
            }};
            Some((entry.id, status))
        }).collect()
    })
}

fn reconcile(db: &Db) {
    let (Some(center), Ok(entries)) = (center(), db.planner_alerts()) else { return };
    let now = now();
    let desired: HashMap<_, _> = entries.iter().filter_map(|entry| {
        let at = entry.reminder_at().ok().flatten()?;
        (at > now).then_some((entry.id, (entry, at)))
    }).collect();
    let authorized = matches!(authorization(&center, false), Ok(true));
    if let Ok(ids) = pending(&center) {
        for id in ids { if !authorized || !desired.contains_key(&id) { cancel(&center, id); } }
    }
    if authorized {
        for (_, (entry, at)) in desired { register(&center, entry, at); }
    }
}
