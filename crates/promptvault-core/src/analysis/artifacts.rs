use crate::analysis::hygiene;
use crate::models::{ArtifactCategory, DetectedArtifact};

/// Erkennt Artefakte im Prompt-Inhalt (Delegation an Hygiene-Modul)
pub fn detect_artifacts(content: &str) -> Vec<DetectedArtifact> {
    let hygiene_result = hygiene::analyze_hygiene(content, "temp");
    hygiene_result.artifacts
}

/// Generiert einen Ersetzungsvorschlag für einen Artefakt-Typ
pub fn get_replacement_suggestion(category: &ArtifactCategory, _matched: &str) -> Option<String> {
    match category {
        ArtifactCategory::ProjectArtifact => Some("{PROJECT_NAME}".into()),
        ArtifactCategory::RepoReference => Some("{REPOSITORY_URL}".into()),
        ArtifactCategory::FilePath => Some("{FILE_PATH}".into()),
        ArtifactCategory::IssueReference => Some("{ISSUE_ID}".into()),
        ArtifactCategory::TestReport => Some("{TEST_RESULTS}".into()),
        ArtifactCategory::LogLine => Some("{LOG_ENTRY}".into()),
        ArtifactCategory::Stacktrace => Some("{STACKTRACE}".into()),
        ArtifactCategory::BuildOutput => Some("{BUILD_COMMAND}".into()),
        ArtifactCategory::JsonDump => Some("{JSON_DATA}".into()),
        ArtifactCategory::CodeDump => Some("{CODE_SNIPPET}".into()),
        ArtifactCategory::Pii => Some("{REDACTED}".into()),
        ArtifactCategory::Secret => Some("{SECRET}".into()),
        ArtifactCategory::ChatMeta => Some("{CHAT_ROLE}".into()),
        ArtifactCategory::ScopePollution => Some("{SCOPE_CLEAN}".into()),
        ArtifactCategory::OcrResidue => Some("{UI_RELEVANT}".into()),
        ArtifactCategory::RoleMismatch => Some("{CORRECTED_ROLE}".into()),
        ArtifactCategory::MissingStructure => Some("{ADD_STRUCTURE}".into()),
        ArtifactCategory::EvidenceBlock => Some("{INTEGRATE_EVIDENCE}".into()),
    }
}
