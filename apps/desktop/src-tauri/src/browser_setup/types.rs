use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome { StoreOpened, SignedPending, PolicyRemoved, Cancelled }

#[cfg(unix)]
#[derive(serde::Deserialize, Serialize)]
pub struct ManagedClaim {
    pub browser: focus_core::model::Browser,
    pub label: String,
    pub slot: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetupError {
    Unsupported, TargetChanged, MissingArtifact, InvalidArtifact, MissingBridge,
    #[cfg(target_os = "linux")]
    MissingAuthorization,
    ManagedElsewhere,
    Conflict, Busy, LaunchFailed, RollbackFailed, Io,
}

impl SetupError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Unsupported => "unsupported_installation",
            Self::TargetChanged => "target_changed",
            Self::MissingArtifact => "missing_artifact",
            Self::InvalidArtifact => "invalid_artifact",
            Self::MissingBridge => "missing_bridge",
            #[cfg(target_os = "linux")]
            Self::MissingAuthorization => "missing_authorization",
            Self::ManagedElsewhere => "managed_elsewhere",
            Self::Conflict => "setup_conflict",
            Self::Busy => "setup_busy",
            Self::LaunchFailed => "launch_failed",
            Self::RollbackFailed => "rollback_failed",
            Self::Io => "setup_failed",
        }
    }
}

impl From<std::io::Error> for SetupError {
    fn from(error: std::io::Error) -> Self {
        if error.kind() == std::io::ErrorKind::AlreadyExists { Self::Conflict } else { Self::Io }
    }
}
