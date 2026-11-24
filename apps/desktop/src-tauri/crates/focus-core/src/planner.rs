use chrono::{LocalResult, NaiveDate, NaiveTime, Offset, TimeZone, Timelike};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind { Plan, Reminder, Log }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub id: Uuid,
    pub kind: Kind,
    pub title: String,
    pub notes: Option<String>,
    pub date: NaiveDate,
    pub time: NaiveTime,
    pub end: Option<NaiveTime>,
    pub zone: String,
    pub lead: Option<u16>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Issue { Title, Zone, TimePrecision, EndPrecision, TimeGap, EndGap, EndRequired, EndOrder, UnexpectedEnd, Lead }

#[derive(Debug, Serialize)]
pub struct Resolved {
    pub time_at: i64,
    pub time_offset: Option<i32>,
    pub end_at: Option<i64>,
    pub end_offset: Option<i32>,
}

impl Entry {
    pub fn validate(&self) -> Result<Resolved, Issue> {
        if self.title.trim().is_empty() { return Err(Issue::Title); }
        let zone: Tz = self.zone.parse().map_err(|_| Issue::Zone)?;
        if self.lead.is_some_and(|n| self.kind != Kind::Reminder || !matches!(n, 0 | 5 | 15 | 60)) {
            return Err(Issue::Lead);
        }
        let resolve = |time: NaiveTime, precision, gap| {
            if time.second() != 0 || time.nanosecond() != 0 { return Err(precision); }
            match zone.from_local_datetime(&self.date.and_time(time)) {
                LocalResult::None => Err(gap),
                LocalResult::Single(at) => Ok((at.timestamp(), None)),
                LocalResult::Ambiguous(a, b) => {
                    let at = a.min(b);
                    Ok((at.timestamp(), Some(at.offset().fix().local_minus_utc())))
                }
            }
        };
        let (time_at, time_offset) = resolve(self.time, Issue::TimePrecision, Issue::TimeGap)?;
        let (end_at, end_offset) = match (self.kind, self.end) {
            (Kind::Plan, None) => return Err(Issue::EndRequired),
            (Kind::Plan, Some(end)) => {
                if end <= self.time { return Err(Issue::EndOrder); }
                let (at, offset) = resolve(end, Issue::EndPrecision, Issue::EndGap)?;
                (Some(at), offset)
            }
            (_, Some(_)) => return Err(Issue::UnexpectedEnd),
            (_, None) => (None, None),
        };
        Ok(Resolved { time_at, time_offset, end_at, end_offset })
    }
}

impl Entry {
    pub fn reminder_at(&self) -> Result<Option<i64>, Issue> {
        let at = self.validate()?.time_at;
        Ok(self.lead.map(|lead| at - i64::from(lead) * 60))
    }
}
