# Enterprise Client-Side Network & DNS Routing Guide

This document details how client machines, developer workstations, autonomous agents, and IDEs (Cursor, VS Code, JetBrains) route traffic transparently through **X4G4T** without code refactoring or individual API key management.

---

## 1. Architectural Overview

```
                                 [ Developer Workstations / IDEs ]
                                (Cursor, VS Code, JetBrains, LangChain)
                                                │
                ┌───────────────────────────────┴───────────────────────────────┐
                │                                                               │
                ▼                                                               ▼
     Method A: Transparent DNS Sinkhole                      Method B: Environment Variable Routing
    (api.openai.com -> 10.x.x.x / CA injected)              (OPENAI_BASE_URL=https://proxy.x4g4t.internal/v1)
                │                                                               │
                └───────────────────────────────┬───────────────────────────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │   X4G4T Proxy      │
                                    │    Port 4000/8080     │
                                    └───────────┬───────────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        │                       │                       │
                        ▼                       ▼                       ▼
            [ 1. Reverse Auth ]       [ 2. Policy & Rate Limit ] [ 3. Enterprise DLP ]
            - Corporate CIDR/mTLS      - Sliding window limits    - Luhn credit card check
            - Local daemon token       - Precedence: Deny-Wins    - AWS/GitHub secret scan
            - Strip dummy keys         - HITL approval holds      - Redact / Block / Alert
                        │                       │                       │
                        └───────────────────────┼───────────────────────┘
                                                │
                                                ▼
                                    [ Key Vault & Injection ]
                                  Inject vaulted enterprise key:
                                 Authorization: Bearer <MASTER_KEY>
                                                │
                                                ▼
                                    [ Upstream LLM Providers ]
                                   (OpenAI, Anthropic, Gemini)
```

> [!IMPORTANT]
> **Enterprise Identity Model & Sign-Up Policy**:
> X4G4T is strictly an **authentication consumer** and **inline policy firewall**, not an Identity Provider (IDP). Self-registration and public sign-up are permanently disabled. User identities, roles (`admin` vs `developer`), and access permissions are managed centrally through corporate IAM systems (Clerk, WorkOS, OIDC, AWS Cognito, Azure AD).

---

## 2. Method A: DNS Sinkholing & Transparent Proxy

DNS sinkholing allows all outbound calls to public LLM endpoints to be routed transparently to the X4G4T proxy gateway without modifying developer code or SDK configurations.

### 2.1 Target LLM Provider Domains

| Upstream Provider | Public FQDN | X4G4T Sinkhole Target |
| :--- | :--- | :--- |
| **OpenAI** | `api.openai.com` | `proxy.x4g4t.internal` (or `10.x.x.x` / `127.0.0.1`) |
| **Google Gemini** | `generativelanguage.googleapis.com` | `proxy.x4g4t.internal` (or `10.x.x.x` / `127.0.0.1`) |
| **Anthropic Claude** | `api.anthropic.com` | `proxy.x4g4t.internal` (or `10.x.x.x` / `127.0.0.1`) |

---

### 2.2 Corporate DNS Configuration

#### Option 1: CoreDNS (Kubernetes / Private VPC)
Add a rewrite block to your `Corefile`:

```corefile
.:53 {
    forward . 1.1.1.1 8.8.8.8

    # Transparently route LLM provider traffic to X4G4T
    rewrite name exact api.openai.com proxy.x4g4t.internal
    rewrite name exact generativelanguage.googleapis.com proxy.x4g4t.internal
    rewrite name exact api.anthropic.com proxy.x4g4t.internal

    log
    errors
}
```

#### Option 2: AWS Route 53 Resolver / Private Hosted Zone
1. Create an AWS Route 53 **Private Hosted Zone** named `openai.com` associated with your corporate VPC.
2. Create an `A` record for `api.openai.com` pointing to the internal load balancer (ALB/NLB) IP of X4G4T.
3. Repeat for `anthropic.com` (`api.anthropic.com`) and `googleapis.com` (`generativelanguage.googleapis.com`).

#### Option 3: Pi-hole / Dnsmasq (Local Lab / Edge Gateways)
Add the following entries to `/etc/dnsmasq.d/05-x4g4t.conf`:

```conf
address=/api.openai.com/10.0.10.50
address=/generativelanguage.googleapis.com/10.0.10.50
address=/api.anthropic.com/10.0.10.50
```

#### Option 4: Local Workstation Testing (`/etc/hosts`)
For local validation without network DNS infrastructure, add to `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```hosts
127.0.0.1   proxy.x4g4t.internal
127.0.0.1   api.openai.com
127.0.0.1   generativelanguage.googleapis.com
127.0.0.1   api.anthropic.com
```

---

## 3. Transparent Proxy & Internal CA Certificate Injection

Because all LLM APIs communicate over encrypted HTTPS (TLS 443), client machines and IDEs must trust the X4G4T Internal Root Certificate Authority (CA) to permit transparent inspection, rate limiting, and DLP without TLS errors.

### 3.1 Generating the Internal Root CA

Run the following command on the X4G4T gateway server:

```bash
# 1. Generate Root CA private key
openssl genrsa -out x4g4t-ca.key 4096

# 2. Generate Self-Signed Root CA certificate (Valid for 10 years)
openssl req -x509 -new -nodes -key x4g4t-ca.key -sha256 -days 3650 \
  -out x4g4t-ca.crt \
  -subj "/C=US/ST=California/L=San Francisco/O=X4G4T/OU=Security Operations/CN=X4G4T Root CA"
```

---

### 3.2 Installing the CA in Operating System Trust Stores

#### macOS
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain x4g4t-ca.crt
```

#### Ubuntu / Debian Linux
```bash
sudo cp x4g4t-ca.crt /usr/local/share/ca-certificates/x4g4t-ca.crt
sudo update-ca-certificates
```

#### Windows (PowerShell as Administrator)
```powershell
Import-Certificate -FilePath .\x4g4t-ca.crt -CertStoreLocation Cert:\LocalMachine\Root
```

---

### 3.3 Configuring IDEs and Developer Runtimes

#### 1. Cursor & VS Code
1. Open VS Code / Cursor Settings (`Cmd + ,` or `Ctrl + ,`).
2. Search for `proxy`.
3. Set the following in `settings.json`:
   ```json
   {
     "http.proxyStrictSSL": true,
     "http.proxySupport": "on",
     "http.proxy": "http://proxy.x4g4t.internal:8080"
   }
   ```
4. If using Node-based extensions in Cursor, set the environment variable:
   ```bash
   export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/x4g4t-ca.crt"
   ```

#### 2. JetBrains IDEs (IntelliJ, PyCharm, WebStorm)
1. Go to **Settings/Preferences** → **Tools** → **Server Certificates**.
2. Check **"Accept non-trusted certificates automatically"** OR click **"+"** under **"Custom Certificates"** and import `x4g4t-ca.crt`.

#### 3. Python (OpenAI SDK, LangChain, LlamaIndex)
```bash
# Instruct requests, httpx, and urllib3 to use the X4G4T CA bundle
export REQUESTS_CA_BUNDLE="/etc/ssl/certs/x4g4t-ca.crt"
export SSL_CERT_FILE="/etc/ssl/certs/x4g4t-ca.crt"
```

#### 4. Node.js & TypeScript
```bash
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/x4g4t-ca.crt"
```

#### 5. cURL & Command-Line Utilities
```bash
export CURL_CA_BUNDLE="/etc/ssl/certs/x4g4t-ca.crt"
```

---

## 4. Method B: Automated Environment Variable Routing

If DNS sinkholing cannot be deployed network-wide, MDM solutions (Jamf, Microsoft Intune, Ansible) can push environment variables to developer machines to redirect traffic cleanly.

### 4.1 System-Wide Environment Configuration

Add to `/etc/profile.d/x4g4t.sh` (Linux) or `/etc/zshrc` / `/etc/bash.bashrc` (macOS):

```bash
# Centralized X4G4T AI Proxy Routing
export OPENAI_BASE_URL="https://proxy.x4g4t.internal/v1"
export ANTHROPIC_BASE_URL="https://proxy.x4g4t.internal/v1"
export HTTPS_PROXY="http://proxy.x4g4t.internal:8080"
export HTTP_PROXY="http://proxy.x4g4t.internal:8080"
export NO_PROXY="localhost,127.0.0.1,.internal"
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/x4g4t-ca.crt"
export SSL_CERT_FILE="/etc/ssl/certs/x4g4t-ca.crt"
```

---

## 5. Zero-Config Reverse Authentication & Key Injection

X4G4T supports **reverse authentication**: developers do not need actual upstream API keys in their IDEs or `.env` files.

### 5.1 How It Works

1. **Client Sends Dummy Key**:
   In Cursor or VS Code, the developer sets a dummy key:
   ```bash
   export OPENAI_API_KEY="sk-ant-developer-session"
   ```
2. **Proxy Identifies Client**:
   The X4G4T proxy identifies the caller via:
   - **Corporate VPN / Subnet Mapping**: Caller IP within trusted CIDR (e.g., `10.0.0.0/8`, `192.168.1.0/24`).
   - **Client TLS Certificate (mTLS)**: Mutual TLS handshake identifying the workstation certificate.
   - **Local Developer Daemon**: Lightweight daemon listening on `localhost:5005` returning the active user's IAM token.
3. **Policy Engine Evaluation**:
   - **Rate Limiting**: Sliding window request counter checked against user/IP/org quota.
   - **DLP Pipeline**: Inspects prompts and tool calls for AWS keys, private keys, SSN, and Luhn-validated credit card numbers.
4. **Header Stripping & Master Key Injection**:
   X4G4T strips the client's dummy header and injects the vaulted corporate master key:
   ```http
   Authorization: Bearer sec_master_live_openai_9918231
   ```
5. **Downstream Forwarding**:
   Request is dispatched to the upstream LLM API in `<15ms`.

---

## 6. Verification & Troubleshooting

### 6.1 Test Connection with cURL
```bash
# Verify DNS sinkholing and proxy certificate
curl -v https://api.openai.com/v1/models \
  -H "Authorization: Bearer dummy-key" \
  --cacert /etc/ssl/certs/x4g4t-ca.crt
```

**Expected Response**:
- HTTP 200 OK from upstream model list (if reverse auth is enabled).
- Or HTTP 429 Too Many Requests (if rate limit window is exceeded).
- Or HTTP 422 Unprocessable Entity (if DLP detects sensitive data).

### 6.2 Test Python OpenAI SDK
```python
from openai import OpenAI

# Automatically picks up OPENAI_BASE_URL and SSL_CERT_FILE from environment
client = OpenAI(api_key="dummy-developer-token")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello X4G4T!"}]
)

print(response.choices[0].message.content)
```

