# Data Loss Prevention (DLP) & Secret Scanning

## 1. Multi-Layer In-Flight Egress Protection

X4G4T's Data Loss Prevention (DLP) subsystem operates directly in the gateway hot-path, inspecting tool arguments, outbound request bodies, and prompt inputs before any bits reach external networks.

---

## 2. Detection Engines & Algorithms

### A. Algorithmic Luhn Mod-10 Validation (Credit Cards)
Rather than relying on basic 16-digit regexes (which suffer from high false-positive rates on random IDs), X4G4T computes the **Luhn Mod-10 checksum algorithm**:
- Validates Major Industry Identifiers (Visa `4...`, Mastercard `5...`, Amex `3...`).
- Numbers that fail the checksum are ignored or classified under generic numeric tokens.
- Numbers that satisfy Luhn are masked to `[REDACTED_PII:CREDIT_CARD]`.

### B. High-Entropy Shannon Secret Scanner
AI agents frequently copy-paste temporary cloud credentials into tool arguments. X4G4T calculates the Shannon entropy:

$$H(X) = -\sum_{i=1}^n P(x_i) \log_2 P(x_i)$$

- Strings with Shannon entropy $H(X) \ge 4.5$ and length $\ge 20$ are classified as high-entropy secrets (API tokens, private keys, session hashes).
- Masked to `[REDACTED_SECRET:HIGH_ENTROPY]`.

### C. Deterministic Secret Signatures
- **AWS Access Keys:** `AKIA[0-9A-Z]{16}` $\rightarrow$ `[REDACTED_SECRET:AWS_KEY]`
- **OpenAI Keys:** `sk-proj-[A-Za-z0-9_-]{48,}` $\rightarrow$ `[REDACTED_SECRET:OPENAI_KEY]`
- **GitHub Tokens:** `ghp_[A-Za-z0-9]{36}` or `gho_[A-Za-z0-9]{36}` $\rightarrow$ `[REDACTED_SECRET:GITHUB_KEY]`
- **Social Security Numbers (US SSN):** `\b\d{3}-\d{2}-\d{4}\b` $\rightarrow$ `[REDACTED_PII:US_SSN]`

---

## 3. Evasion Resistance & Pre-Processing

Attackers and jailbroken agents often attempt to bypass regexes using character obfuscation. X4G4T applies strict pre-processing:

1. **Zero-Width Character Stripping:**  
   Removes zero-width spaces (`\u200B`), zero-width non-joiners (`\u200C`), zero-width joiners (`\u200D`), and byte order marks (`\uFEFF`) before scanning.
2. **Unicode NFKC Normalization:**  
   Translates homoglyphs, full-width characters, and mathematical alphanumeric symbols to standard ASCII.
3. **Deep Recursive Sanitization:**  
   Recursively traverses JSON objects and arrays up to 64 levels deep, redacting sensitive attributes in-place while preserving non-sensitive fields.
