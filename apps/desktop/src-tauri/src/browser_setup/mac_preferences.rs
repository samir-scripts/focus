use super::{Document, SetupError, ENABLED, SETTINGS};
use core_foundation::{array::CFArray, base::{CFType, TCFType}, data::CFData, dictionary::CFDictionary, string::CFString};
use core_foundation_sys::{preferences::*, propertylist::{kCFPropertyListXMLFormat_v1_0, CFPropertyListCreateData, CFPropertyListCreateWithData}};
use serde_json::Value;
use std::ptr;

fn value_to_json(value: CFType) -> Result<Value, SetupError> {
    let data = unsafe { CFPropertyListCreateData(ptr::null(), value.as_CFTypeRef(), kCFPropertyListXMLFormat_v1_0, 0, ptr::null_mut()) };
    if data.is_null() { return Err(SetupError::Conflict); }
    let data = unsafe { CFData::wrap_under_create_rule(data) };
    plist::from_bytes(data.bytes()).map_err(|_| SetupError::Conflict)
}

fn json_to_value(value: &Value) -> Result<CFType, SetupError> {
    let mut xml = Vec::new();
    plist::to_writer_xml(&mut xml, value).map_err(|_| SetupError::Conflict)?;
    let data = CFData::from_buffer(&xml);
    let raw = unsafe { CFPropertyListCreateWithData(ptr::null(), data.as_concrete_TypeRef(), 0, ptr::null_mut(), ptr::null_mut()) };
    if raw.is_null() { return Err(SetupError::Conflict); }
    Ok(unsafe { CFType::wrap_under_create_rule(raw) })
}

fn keys(domain: &CFString) -> Vec<CFString> {
    let raw = unsafe { CFPreferencesCopyKeyList(domain.as_concrete_TypeRef(), kCFPreferencesCurrentUser, kCFPreferencesAnyHost) };
    if raw.is_null() { return Vec::new(); }
    let keys = unsafe { CFArray::<CFString>::wrap_under_create_rule(raw) };
    keys.iter().map(|key| (*key).clone()).collect()
}

pub fn no_other_keys(domain: &str) -> Result<bool, SetupError> {
    let domain = CFString::new(domain);
    Ok(keys(&domain).iter().all(|key| matches!(key.to_string().as_str(), ENABLED | SETTINGS)))
}

fn app_value(domain: &CFString, key: &CFString) -> Result<Option<Value>, SetupError> {
    let value = unsafe { CFPreferencesCopyAppValue(key.as_concrete_TypeRef(), domain.as_concrete_TypeRef()) };
    if value.is_null() { return Ok(None); }
    value_to_json(unsafe { CFType::wrap_under_create_rule(value) }).map(Some)
}

pub fn snapshot(domain: &str) -> Result<Option<Vec<u8>>, SetupError> {
    let domain = CFString::new(domain);
    let app = domain.as_concrete_TypeRef();
    if unsafe { CFPreferencesAppSynchronize(app) } == 0 { return Err(SetupError::Io); }
    for name in ["DisableMacOSUserPolicies", "ExtensionSettings__focus@focus-local__installation_mode"] {
        let key = CFString::new(name);
        if unsafe { CFPreferencesAppValueIsForced(key.as_concrete_TypeRef(), app) } != 0
            && app_value(&domain, &key)? != Some(Value::Bool(false))
        {
            return Err(SetupError::Conflict);
        }
    }
    let mut document = Document::new();
    for name in [SETTINGS, ENABLED] {
        let key = CFString::new(name);
        let reference = key.as_concrete_TypeRef();
        if unsafe { CFPreferencesAppValueIsForced(reference, app) } != 0 { return Err(SetupError::Conflict); }
        let user_value = unsafe { CFPreferencesCopyValue(reference, app, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) };
        let user_value = if user_value.is_null() { None } else {
            Some(value_to_json(unsafe { CFType::wrap_under_create_rule(user_value) })?)
        };
        if app_value(&domain, &key)? != user_value { return Err(SetupError::Conflict); }
        if let Some(value) = user_value { document.insert(name.to_owned(), value); }
    }
    if keys(&domain).iter().any(|key| key.to_string().starts_with("ExtensionSettings__")) {
        return Err(SetupError::Conflict);
    }
    if document.is_empty() { Ok(None) } else {
        serde_json::to_vec(&document).map(Some).map_err(|_| SetupError::Io)
    }
}

pub fn save(domain: &str, previous: Option<&[u8]>, document: &Document) -> Result<(), SetupError> {
    let before: Document = previous.map_or_else(|| Ok(Document::new()), serde_json::from_slice).map_err(|_| SetupError::Conflict)?;
    let mut set = Vec::new();
    let mut remove = Vec::new();
    for key in [SETTINGS, ENABLED] {
        match (before.get(key), document.get(key)) {
            (old, new) if old == new => (),
            (_, Some(value)) => set.push((CFString::new(key), json_to_value(value)?)),
            (_, None) => remove.push(CFString::new(key)),
        }
    }
    let set = CFDictionary::from_CFType_pairs(&set);
    let remove = CFArray::from_CFTypes(&remove);
    if snapshot(domain)?.as_deref() != previous { return Err(SetupError::Conflict); }
    let domain_ref = CFString::new(domain);
    let app = domain_ref.as_concrete_TypeRef();
    let success = unsafe {
        CFPreferencesSetMultiple(set.as_concrete_TypeRef(), remove.as_concrete_TypeRef(), app, kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
        CFPreferencesSynchronize(app, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
    };
    if success == 0 { return Err(SetupError::Io); }
    let observed: Document = snapshot(domain)?.map_or_else(|| Ok(Document::new()), |data| serde_json::from_slice(&data)).map_err(|_| SetupError::Conflict)?;
    if &observed != document { return Err(SetupError::Conflict); }
    Ok(())
}
