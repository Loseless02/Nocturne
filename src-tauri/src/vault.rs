//! Encrypted vault file.
//!
//! Layout (all integers little-endian):
//!   magic "NOCT" | format u8 | m_cost u32 | t_cost u32 | p_cost u32 | salt [16] | nonce [24] | ciphertext
//! Key = Argon2id(master, salt, m/t/p). Cipher = XChaCha20-Poly1305 with the
//! whole header as associated data, so tampering with the KDF params fails auth.

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use zeroize::Zeroizing;

const MAGIC: &[u8; 4] = b"NOCT";
const FORMAT: u8 = 1;
const HEADER_LEN: usize = 4 + 1 + 12 + 16 + 24;

/// 64 MiB, 3 passes, 1 lane: roughly half a second on a modern CPU.
const KDF: (u32, u32, u32) = (64 * 1024, 3, 1);

pub struct Session {
    key: Zeroizing<[u8; 32]>,
    salt: [u8; 16],
    kdf: (u32, u32, u32),
}

fn derive(master: &str, salt: &[u8; 16], kdf: (u32, u32, u32)) -> Result<Zeroizing<[u8; 32]>, String> {
    let params = Params::new(kdf.0, kdf.1, kdf.2, Some(32)).map_err(|e| e.to_string())?;
    let mut key = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(master.as_bytes(), salt, key.as_mut())
        .map_err(|e| e.to_string())?;
    Ok(key)
}

impl Session {
    pub fn new(master: &str) -> Result<Self, String> {
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = derive(master, &salt, KDF)?;
        Ok(Session { key, salt, kdf: KDF })
    }

    pub fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce = [0u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let mut out = Vec::with_capacity(HEADER_LEN + plain.len() + 16);
        out.extend_from_slice(MAGIC);
        out.push(FORMAT);
        out.extend_from_slice(&self.kdf.0.to_le_bytes());
        out.extend_from_slice(&self.kdf.1.to_le_bytes());
        out.extend_from_slice(&self.kdf.2.to_le_bytes());
        out.extend_from_slice(&self.salt);
        out.extend_from_slice(&nonce);
        let cipher = XChaCha20Poly1305::new(self.key.as_ref().into());
        let ct = cipher
            .encrypt(XNonce::from_slice(&nonce), Payload { msg: plain, aad: &out[..HEADER_LEN] })
            .map_err(|_| "Encryption failed".to_string())?;
        out.extend_from_slice(&ct);
        Ok(out)
    }
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// Decrypts a vault file with the given master password.
pub fn open(bytes: &[u8], master: &str) -> Result<(Session, Zeroizing<String>), String> {
    if bytes.len() < HEADER_LEN + 16 || &bytes[..4] != MAGIC {
        return Err("This is not a Nocturne vault file.".to_string());
    }
    if bytes[4] != FORMAT {
        return Err("Unsupported vault format version.".to_string());
    }
    let kdf = (u32_at(bytes, 5), u32_at(bytes, 9), u32_at(bytes, 13));
    // Refuse absurd params from a crafted file (memory bomb / endless loop).
    if kdf.0 < 8 * 1024 || kdf.0 > 1024 * 1024 || kdf.1 == 0 || kdf.1 > 20 || kdf.2 == 0 || kdf.2 > 16 {
        return Err("Vault file has invalid key settings.".to_string());
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&bytes[17..33]);
    let nonce = XNonce::from_slice(&bytes[33..57]);
    let key = derive(master, &salt, kdf)?;
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    let plain = cipher
        .decrypt(nonce, Payload { msg: &bytes[HEADER_LEN..], aad: &bytes[..HEADER_LEN] })
        .map_err(|_| "Wrong master password.".to_string())?;
    let plain = Zeroizing::new(plain);
    let text = String::from_utf8(plain.to_vec()).map_err(|_| "Vault content is corrupted.".to_string())?;
    Ok((Session { key, salt, kdf }, Zeroizing::new(text)))
}

/// Write to a temp file, flush to disk, keep the previous version as .bak, then swap in.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = File::create(&tmp).map_err(|e| format!("Could not write file: {e}"))?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    if path.exists() && path.extension().map(|e| e == "noct").unwrap_or(false) {
        let _ = fs::copy(path, path.with_extension("noct.bak"));
    }
    fs::rename(&tmp, path).map_err(|e| format!("Could not save file: {e}"))
}
