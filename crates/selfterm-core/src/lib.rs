pub mod crypto;
pub mod domain;
pub mod storage;
pub mod vault;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("vault is locked")]
    Locked,
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
    #[error("vault authentication failed")]
    WrongKey,
    #[error("invalid or unsupported storage")]
    CorruptStorage,
    #[error("local generation conflict")]
    Conflict,
    #[error("storage operation failed")]
    Storage(#[from] rusqlite::Error),
    #[error("filesystem operation failed")]
    Io(#[from] std::io::Error),
    #[error("random source unavailable")]
    Random,
}
pub type Result<T> = std::result::Result<T, Error>;
