use crate::models::DetectedArtifact;

/// Generiert Verbesserungsvorschläge basierend auf erkannten Artefakten
pub fn generate_recommendations(artifacts: &[DetectedArtifact]) -> Vec<String> {
    let mut recommendations: Vec<String> = Vec::new();

    for artifact in artifacts {
        if let Some(ref suggestion) = artifact.replacement_suggestion {
            let rec = match artifact.category {
                crate::models::ArtifactCategory::Secret => {
                    format!("KRITISCH: Entferne das Secret »{}« sofort! Ersetze es durch eine Umgebungsvariable oder einen Platzhalter.", artifact.r#match)
                }
                crate::models::ArtifactCategory::Pii => {
                    format!(
                        "Datenschutz: Ersetze »{}« durch {} um personenbezogene Daten zu schützen.",
                        artifact.r#match, suggestion
                    )
                }
                crate::models::ArtifactCategory::ProjectArtifact => {
                    format!(
                        "Ersetze den Projektnamen »{}« durch einen generischen Platzhalter wie {}.",
                        artifact.r#match, suggestion
                    )
                }
                _ => {
                    format!(
                        "Ersetze »{}« durch den generischen Platzhalter {}.",
                        artifact.r#match, suggestion
                    )
                }
            };
            recommendations.push(rec);
        }
    }

    // Dedupliziere
    recommendations.sort();
    recommendations.dedup();

    recommendations
}
