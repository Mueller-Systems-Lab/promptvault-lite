pub mod artifacts;
pub mod hygiene;
pub mod quality;
pub mod r2;
pub mod recommendations;

pub use artifacts::{detect_artifacts, get_replacement_suggestion};
pub use hygiene::analyze_hygiene;
pub use quality::evaluate_prompt;
pub use recommendations::generate_recommendations;
