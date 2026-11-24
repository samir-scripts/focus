use std::{collections::HashMap, ptr::NonNull, sync::mpsc, thread, time::Duration};

use block2::{DynBlock, RcBlock};
use focus_core::{db::{Db, Error}, planner::Entry};
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
            for _ in 0..3 {
                let reconciled = {
                    let Ok(_guard) = MUTATION.lock() else { return };
                    Db::open_default().is_ok_and(|db| autoreleasepool(|_| reconcile(&db)))
                };
                if reconciled { return; }
                thread::sleep(Duration::from_secs(1));
            }
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

struct PendingAlert {
    title: String,
    at: Option<i64>,
}

impl PendingAlert {
    fn matches(&self, title: &str, at: i64) -> bool {
        self.title == title && self.at == Some(at)
    }
}

fn pending(center: &UNUserNotificationCenter) -> Result<HashMap<Uuid, PendingAlert>, AlertStatus> {
    let (tx, rx) = mpsc::channel();
    let reply = RcBlock::new(move |requests: NonNull<NSArray<UNNotificationRequest>>| {
        let alerts = unsafe { requests.as_ref() }.iter().filter_map(|request| {
            let id = Uuid::parse_str(request.identifier().to_string().strip_prefix(PREFIX)?).ok()?;
            let at = request.trigger()
                .and_then(|trigger| trigger.downcast::<UNCalendarNotificationTrigger>().ok())
                .and_then(|trigger| trigger.nextTriggerDate())
                .map(|date| date.timeIntervalSince1970().round() as i64);
            Some((id, PendingAlert { title: request.content().title().to_string(), at }))
        }).collect();
        let _ = tx.send(alerts);
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

pub(super) fn cancel_before_change(db: &Db, id: Uuid) -> Result<(), Error> {
    if !db.planner_has_alert(id)? { return Ok(()); }
    autoreleasepool(|_| {
        let Some(center) = center() else { return Ok(()) };

        // Keep the saved entry until macOS confirms its old request is gone.
        for _ in 0..3 {
            let requests = pending(&center).map_err(|_| Error::Database)?;
            if !requests.contains_key(&id) { return Ok(()); }
            cancel(&center, id);
            thread::sleep(Duration::from_millis(60));
        }
        match pending(&center) {
            Ok(requests) if !requests.contains_key(&id) => Ok(()),
            _ => Err(Error::Database),
        }
    })
}

pub(super) fn schedule(entry: &Entry, at: i64) -> AlertStatus {
    autoreleasepool(|_| {
        let Some(center) = center() else { return AlertStatus::Unavailable };
        match authorization(&center, true) {
            Ok(true) => register(&center, entry, at),
            Ok(false) => AlertStatus::Denied,
            Err(status) => status,
        }
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
                Ok(requests) if requests.get(&entry.id).is_some_and(|alert| alert.matches(&entry.title, at)) => AlertStatus::Scheduled,
                Ok(_) => AlertStatus::Failed,
                Err(status) => *status,
            }};
            Some((entry.id, status))
        }).collect()
    })
}

struct Reconciliation {
    cancel: Vec<Uuid>,
    register: Vec<Uuid>,
}

fn reconciliation(authorization: Result<bool, AlertStatus>, requests: &HashMap<Uuid, PendingAlert>,
    desired: &HashMap<Uuid, (&str, i64)>) -> Result<Reconciliation, AlertStatus> {
    let allowed = authorization?;
    let cancel = requests.keys().copied()
        .filter(|id| !allowed || !desired.contains_key(id)).collect();
    let register = desired.iter()
        .filter(|(id, (title, at))| allowed && !requests.get(id).is_some_and(|request| request.matches(title, *at)))
        .map(|(id, _)| *id).collect();
    Ok(Reconciliation { cancel, register })
}

fn reconcile(db: &Db) -> bool {
    let Some(center) = center() else { return true };
    let Ok(entries) = db.planner_alerts() else { return false };
    let authorization = authorization(&center, false);
    let Ok(requests) = pending(&center) else { return false };
    let now = now();
    let desired: HashMap<_, _> = entries.iter().filter_map(|entry| {
        let at = entry.reminder_at().ok().flatten()?;
        (at > now).then_some((entry.id, (entry, at)))
    }).collect();
    let info = desired.iter().map(|(id, (entry, at))| (*id, (entry.title.as_str(), *at))).collect();
    let Ok(actions) = reconciliation(authorization, &requests, &info) else { return false };
    for id in actions.cancel { cancel(&center, id); }
    let mut successful = true;
    for id in actions.register {
        let (entry, at) = desired[&id];
        successful &= !matches!(register(&center, entry, at), AlertStatus::Failed);
    }
    successful
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timed_out_permission_lookup_does_not_plan_a_cancellation() {
        let id = Uuid::nil();
        let requests = HashMap::from([(id, PendingAlert { title: "Saved".into(), at: Some(1_000) })]);
        assert!(matches!(
            reconciliation(Err(AlertStatus::Failed), &requests, &HashMap::new()),
            Err(AlertStatus::Failed),
        ));
    }

    #[test]
    fn reconciliation_preserves_current_requests_and_replaces_stale_ones() {
        let current = Uuid::from_u128(1);
        let stale = Uuid::from_u128(2);
        let orphan = Uuid::from_u128(3);
        let requests = HashMap::from([
            (current, PendingAlert { title: "Saved".into(), at: Some(1_000) }),
            (stale, PendingAlert { title: "Saved".into(), at: Some(999) }),
            (orphan, PendingAlert { title: "Removed".into(), at: Some(1_000) }),
        ]);
        let desired = HashMap::from([(current, ("Saved", 1_000)), (stale, ("Saved", 1_000))]);
        let actions = reconciliation(Ok(true), &requests, &desired).ok().unwrap();
        assert_eq!(actions.cancel, [orphan]);
        assert_eq!(actions.register, [stale]);
    }
}
