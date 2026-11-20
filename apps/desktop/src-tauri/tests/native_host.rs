use serde_json::{json, Value};
use std::{io::{Read, Write}, process::{Child, Command, Stdio}};

const PROFILE: &str = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
const OTHER: &str = "729d5c23-beb6-4525-a98e-95443e098df3";
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_TOKEN: &str = "1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ORIGIN: &str = "https://m.youtube.com/*";

struct Harness { dir: tempfile::TempDir, host: Child }
impl Harness {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let manifest = dir.path().join("com.focus_local.bridge.json");
        let host_path = env!("CARGO_BIN_EXE_focus-native-host");
        std::fs::write(&manifest, json!({"name":"com.focus_local.bridge","path":host_path,"type":"stdio","allowed_extensions":["focus@focus-local"]}).to_string()).unwrap();
        let host = Command::new(host_path).arg(manifest).arg("focus@focus-local")
            .env("FOCUS_DATA_DIR", dir.path()).env("FOCUS_FIXTURE_NO_DESKTOP", "1")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
        Self { dir, host }
    }
    fn request(&mut self, request: Value) -> Value {
        let bytes = serde_json::to_vec(&request).unwrap();
        let input = self.host.stdin.as_mut().unwrap();
        input.write_all(&(bytes.len() as u32).to_ne_bytes()).unwrap();
        input.write_all(&bytes).unwrap();
        loop {
            let output = self.host.stdout.as_mut().unwrap();
            let mut length = [0; 4];
            output.read_exact(&mut length).unwrap();
            let mut bytes = vec![0; u32::from_ne_bytes(length) as usize];
            output.read_exact(&mut bytes).unwrap();
            let message: Value = serde_json::from_slice(&bytes).unwrap();
            if message.get("event").is_none() { return message; }
        }
    }
    fn op(&mut self, op: &str, body: Value) -> Value { self.request(json!({"v":1,"id":"1","op":op,"body":body})) }
    fn admin(&self, args: &[&str]) -> std::process::Output {
        Command::new(env!("CARGO_BIN_EXE_focus-fixture-admin")).args(args).env("FOCUS_DATA_DIR", self.dir.path()).output().unwrap()
    }
    fn pair(&mut self, profile: &str, token: &str) -> Value {
        self.op("pair_begin", json!({"profileId":profile,"browser":"firefox","label":"  Local profile  ","token":token}))
    }
}
impl Drop for Harness { fn drop(&mut self) { let _ = self.host.kill(); let _ = self.host.wait(); } }

#[test]
fn approval_binds_each_request_and_policy_persists_without_profiles() {
    let mut h = Harness::new();
    assert!(h.admin(&["rule", "0", "true"]).status.success());
    assert_eq!(h.pair(PROFILE,TOKEN)["ok"], true);
    assert_eq!(h.pair(OTHER,OTHER_TOKEN)["ok"], true);
    let pending: Value = serde_json::from_slice(&h.admin(&["state"]).stdout).unwrap();
    let request = pending["pending"][0]["id"].as_str().unwrap();
    assert_eq!(pending["pending"][0]["label"], "Local profile");
    assert_eq!(pending["pending"][0]["browser"], "firefox");
    assert_ne!(pending["pending"][1]["id"], request);
    assert_eq!(h.pair(PROFILE,OTHER_TOKEN)["error"]["code"], "unauthorized");
    assert!(!h.admin(&["approve", PROFILE]).status.success());
    assert!(h.admin(&["approve", request, "Edited label"]).status.success());
    assert_eq!(h.op("hello",json!({"profileId":OTHER,"token":OTHER_TOKEN}))["error"]["code"], "pair_pending");
    assert_eq!(h.op("hello",json!({"profileId":PROFILE,"token":OTHER_TOKEN}))["error"]["code"], "unauthorized");
    assert_eq!(h.op("hello",json!({"profileId":PROFILE,"token":TOKEN}))["body"]["revision"], 1);
    assert_eq!(h.op("applied",json!({"revision":1,"origins":["https://*.youtube.com/*"]}))["error"]["code"], "invalid_request");
    assert_eq!(h.op("applied",json!({"revision":1,"origins":[ORIGIN]}))["ok"], true);
    assert!(!h.admin(&["rule","0","false"]).status.success());
    assert_eq!(h.op("snapshot",json!({"afterRevision":0}))["body"],json!({"revision":1,"sites":[{"id":"youtube","rules":{"youtube.hide-shorts":true}}]}));
    assert_eq!(h.op("snapshot",json!({"afterRevision":1}))["body"],json!({"revision":1}));
    h.host.kill().unwrap();
    h.host.wait().unwrap();
    let state: Value = serde_json::from_slice(&h.admin(&["state"]).stdout).unwrap();
    assert_eq!(state["hideShorts"], true);
    assert_eq!(state["profiles"][0]["label"], "Edited label");
    assert!(h.admin(&["rule", "1", "false"]).status.success());
}

#[test]
fn rejects_protocol_mismatch_and_revoked_profiles() {
    let mut h = Harness::new();
    let fixture: Value = serde_json::from_str(include_str!("../../../../tests/protocol/v1.json")).unwrap();
    let mut hello = fixture["hello"].clone();
    hello["v"] = json!(2);
    assert_eq!(h.request(hello), fixture["versionMismatch"]);
    assert_eq!(h.pair(PROFILE,TOKEN)["ok"], true);
    let state: Value = serde_json::from_slice(&h.admin(&["state"]).stdout).unwrap();
    assert!(h.admin(&["approve", state["pending"][0]["id"].as_str().unwrap()]).status.success());
    assert_eq!(h.request(fixture["hello"].clone())["ok"], true);
    assert!(h.admin(&["revoke",PROFILE]).status.success());
    assert_eq!(h.op("snapshot",json!({"afterRevision":null}))["error"]["code"], "unpaired");
}
