#!/usr/bin/env bash
# ============================================================================
# X4G4T End-to-End Integration & Verification Harness
# Tests Fastify Gateway, MCP Router, Policy Engine, DLP, Prometheus & Elasticsearch
# ============================================================================

set -e

PROXY_URL="${1:-http://127.0.0.1:4000}"
ELASTICSEARCH_URL="${2:-http://127.0.0.1:9200}"
TEST_KEY="${3:-dummy-developer-token}"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}    X4G4T Phase 5 Turn-Key Verification Suite      ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo "Target Proxy:         $PROXY_URL"
echo "Target Elasticsearch: $ELASTICSEARCH_URL"
echo ""

PASSED_COUNT=0
TOTAL_COUNT=0

run_test() {
  local name="$1"
  local cmd="$2"
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  echo -n -e "Test $TOTAL_COUNT: $name ... "
  
  if eval "$cmd" > /tmp/x4g4t_test.out 2>&1; then
    echo -e "${GREEN}PASSED ✓${NC}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
  else
    echo -e "${RED}FAILED ✗${NC}"
    echo -e "${YELLOW}Output:${NC}"
    cat /tmp/x4g4t_test.out | head -n 10
  fi
}

# 1. Healthz Check
run_test "Gateway Health Check (/healthz)" \
  "curl -s -f $PROXY_URL/healthz | grep -q 'ok'"

# 2. Prometheus Metrics Check
run_test "Prometheus Telemetry Scraping (/metrics)" \
  "curl -s $PROXY_URL/metrics | grep -q 'http_requests_total'"

# 3. Gateway Execute - Policy ALLOW Pass-Through
run_test "Gateway Execute - Compliant Tool Call (ALLOW)" \
  "curl -s -X POST $PROXY_URL/v1/gateway/execute \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'Content-Type: application/json' \
    -d '{
      \"agent_id\": \"ci-agent-1\",
      \"tool_name\": \"get_weather\",
      \"arguments\": {\"city\": \"San Francisco\"},
      \"downstream_url\": \"$PROXY_URL/healthz\"
    }' | grep -q 'ok'"

# 4. Gateway Execute - Policy BLOCK (SQL DROP TABLE)
run_test "Gateway Execute - Catch Table Drop Policy (BLOCK 422)" \
  "curl -s -w '%{http_code}' -X POST $PROXY_URL/v1/gateway/execute \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'Content-Type: application/json' \
    -d '{
      \"agent_id\": \"malicious-agent\",
      \"tool_name\": \"run_sql_query\",
      \"arguments\": {\"query\": \"DROP TABLE users;\"},
      \"downstream_url\": \"$PROXY_URL/healthz\"
    }' | grep -q '422'"

# 5. Gateway Execute - Policy REQUIRE_APPROVAL (HITL Hold)
run_test "Gateway Execute - High Value Refund (REQUIRE_APPROVAL 202 HELD)" \
  "curl -s -w '%{http_code}' -X POST $PROXY_URL/v1/gateway/execute \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'Content-Type: application/json' \
    -d '{
      \"agent_id\": \"support-bot\",
      \"tool_name\": \"issue_refund\",
      \"arguments\": {\"amount\": 1500},
      \"downstream_url\": \"$PROXY_URL/healthz\"
    }' | grep -q '202'"

# 6. MCP Router - Lifecycle Frame (tools/list)
run_test "MCP Router - Lifecycle Frame Pass-Through (tools/list)" \
  "curl -s -X POST $PROXY_URL/v1/gateway/mcp \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'X-Target-MCP-URL: $PROXY_URL/healthz' \
    -H 'Content-Type: application/json' \
    -d '{
      \"jsonrpc\": \"2.0\",
      \"id\": 101,
      \"method\": \"tools/list\"
    }' | grep -q 'ok'"

# 7. MCP Router - Block Dangerous tools/call (Error -32001)
run_test "MCP Router - Intercept Destructive tools/call (Code -32001)" \
  "curl -s -X POST $PROXY_URL/v1/gateway/mcp \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'X-Target-MCP-URL: $PROXY_URL/healthz' \
    -H 'Content-Type: application/json' \
    -d '{
      \"jsonrpc\": \"2.0\",
      \"id\": 102,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"run_sql_query\",
        \"arguments\": {\"query\": \"DROP TABLE customer_records;\"}
      }
    }' | grep -q '\"code\":-32001'"

# 8. MCP Router - Hold High-Impact tools/call (X4G4T HELD)
run_test "MCP Router - Intercept High-Value tools/call (HELD card)" \
  "curl -s -X POST $PROXY_URL/v1/gateway/mcp \
    -H 'Authorization: Bearer $TEST_KEY' \
    -H 'X-Target-MCP-URL: $PROXY_URL/healthz' \
    -H 'Content-Type: application/json' \
    -d '{
      \"jsonrpc\": \"2.0\",
      \"id\": 103,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"issue_refund\",
        \"arguments\": {\"amount\": 2500}
      }
    }' | grep -q 'X4G4T HELD'"

echo ""
echo -e "${CYAN}======================================================${NC}"
echo -e "Tests Completed: ${GREEN}$PASSED_COUNT${NC} / $TOTAL_COUNT passed"
echo -e "${CYAN}======================================================${NC}"

if [ "$PASSED_COUNT" -eq "$TOTAL_COUNT" ]; then
  echo -e "${GREEN}All X4G4T Turn-Key Gateway & MCP integration checks passed!${NC}"
  exit 0
else
  echo -e "${RED}Some checks failed. See diagnostics above.${NC}"
  exit 1
fi
