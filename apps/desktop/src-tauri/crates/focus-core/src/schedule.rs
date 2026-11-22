use crate::db::{Error, Result};
use chrono::{DateTime, Datelike, NaiveDate, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Schedule {
    pub id: Uuid,
    pub date: String,
    pub time: String,
    pub zone: String,
    /// Monday is the least significant bit; `None` is a one-off.
    pub weekdays: Option<u8>,
}


impl Schedule {
    pub fn next_after(&self, timestamp: i64) -> Result<Option<DateTime<Utc>>> {
        let first = NaiveDate::parse_from_str(&self.date, "%Y-%m-%d").map_err(|_| Error::Invalid)?;
        let time = NaiveTime::parse_from_str(&self.time, "%H:%M").map_err(|_| Error::Invalid)?;
        let zone: Tz = self.zone.parse().map_err(|_| Error::Invalid)?;
        let after = DateTime::from_timestamp(timestamp, 0).ok_or(Error::Invalid)?;
        let on_date = |date: NaiveDate| {
            zone.from_local_datetime(&date.and_time(time)).earliest()
                .map(|local| local.with_timezone(&Utc))
                .filter(|instant| *instant > after)
        };
        let Some(days) = self.weekdays else { return Ok(on_date(first)); };
        if !(1..=127).contains(&days) { return Err(Error::Invalid); }
        let mut date = first.max(after.with_timezone(&zone).date_naive());
        loop {
            if days & (1 << date.weekday().num_days_from_monday()) != 0 {
                if let Some(instant) = on_date(date) {
                    return Ok(Some(instant));
                }
            }
            let Some(next) = date.succ_opt() else { return Ok(None); };
            date = next;
        }
    }
}