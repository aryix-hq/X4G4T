# Kubernetes Production Hardening & Deployment Guide

## 1. High-Assurance Pod Security Standards

When deploying X4G4T to enterprise Kubernetes clusters (EKS, GKE, AKS, or OpenShift), enforce the **Kubernetes Restricted Pod Security Standard**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: x4g4t-proxy
  namespace: x4g4t-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: x4g4t-proxy
  template:
    metadata:
      labels:
        app: x4g4t-proxy
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: proxy
          image: ghcr.io/aryix-hq/x4g4t-proxy:latest
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "512Mi"
          ports:
            - containerPort: 4000
              name: http-proxy
          readinessProbe:
            httpGet:
              path: /healthz
              port: 4000
            initialDelaySeconds: 3
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /healthz
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
```

---

## 2. Prometheus ServiceMonitor & Scraping

Expose Prometheus metrics for auto-discovery by the Prometheus Operator:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: x4g4t-proxy-monitor
  namespace: x4g4t-system
spec:
  selector:
    matchLabels:
      app: x4g4t-proxy
  endpoints:
    - port: http-proxy
      path: /metrics
      interval: 15s
```

### Critical SLIs to Alert On
- `x4g4t_http_requests_total{status="422"}`: Spikes indicate active policy violations or adversarial prompt injection.
- `x4g4t_ssrf_blocked_total`: Immediate red-team alert if an agent attempts to query cloud metadata (`169.254.169.254`).
- `x4g4t_kill_switch_active_drop_engaged`: Triggers critical P1 page to on-call SecOps.
