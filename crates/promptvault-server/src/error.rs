//! Shared API error model + response mapping (issue #111 / D2).

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

/// Machine-readable API error, serialized as `{ "error": { "code", "message" } }`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ApiError {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    BadRequest,
    NotFound,
    Forbidden,
    Conflict,
    Internal,
}

impl ApiError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::BadRequest,
            message: message.into(),
        }
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::NotFound,
            message: message.into(),
        }
    }
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Forbidden,
            message: message.into(),
        }
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::Internal,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.code {
            ErrorCode::BadRequest => StatusCode::BAD_REQUEST,
            ErrorCode::NotFound => StatusCode::NOT_FOUND,
            ErrorCode::Forbidden => StatusCode::FORBIDDEN,
            ErrorCode::Conflict => StatusCode::CONFLICT,
            ErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(serde_json::json!({ "error": self }))).into_response()
    }
}

/// Uniform result alias for handlers.
pub type ApiResult<T> = Result<T, ApiError>;

/// Maps a core (`String`-based) error into a sanitized internal API error.
/// The message is logged; the client receives a generic code to avoid
/// leaking filesystem internals (path disclosure is covered by the J1 tests).
pub fn map_core_error(context: &str, err: String) -> ApiError {
    log::error!("{context}: {err}");
    ApiError::internal("interner Serverfehler")
}
