//! promptvault-core — framework-free Rust core of PromptVault Lite.
//!
//! Contains the models, parser, scanner, analysis engine, database layer and
//! observability DTOs extracted from the original single tauri crate
//! (epic #97, issues #99/#101–#105). No Tauri, HTTP or UI framework
//! dependencies live here: this crate is consumed by the desktop shell
//! (`src-tauri`) and the server binary (`promptvault-server`).

pub mod analysis;
pub mod database;
pub mod models;
pub mod observability;
pub mod parser;
pub mod scanner;
