#!/bin/bash

# E2E Test Runner for Customers CRUD
# Runs complete test suite twice with 100% pass rate requirement
# Includes test database setup, backend in test mode, and Playwright tests

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
API_DIR="$SCRIPT_DIR/apps/api"
WEB_DIR="$SCRIPT_DIR/apps/web"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}🧹 Cleaning up processes...${NC}"
  # Kill all background processes
  jobs -p | xargs -r kill 2>/dev/null || true
  wait 2>/dev/null || true
}

trap cleanup EXIT

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  E2E Test Suite: Customers CRUD - Complete Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Step 1: Setup test database
echo -e "${YELLOW}📦 Step 1: Setting up test database...${NC}\n"
cd "$API_DIR"
npx ts-node scripts/setup-test-db.ts
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Test database setup failed${NC}"
  exit 1
fi

# Step 2: Start backend in test mode
echo -e "\n${YELLOW}🚀 Step 2: Starting API server in test mode...${NC}\n"
cd "$API_DIR"
export NODE_ENV=test
export DISABLE_AUTH_THROTTLE=true
export DATABASE_URL="postgresql://erp:erp@localhost:5433/erp_test?schema=public"

npm run start:dev &
API_PID=$!
echo -e "${GREEN}✅ API server started (PID: $API_PID)${NC}"

# Wait for API to be ready
echo -e "${YELLOW}⏳ Waiting for API to be ready...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:4000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✅ API is ready${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ API failed to start${NC}"
    kill $API_PID 2>/dev/null || true
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Step 3: Start frontend dev server
echo -e "\n${YELLOW}🎨 Step 3: Starting frontend dev server...${NC}\n"
cd "$WEB_DIR"
npm run dev &
WEB_PID=$!
echo -e "${GREEN}✅ Frontend dev server started (PID: $WEB_PID)${NC}"

# Wait for frontend to be ready
echo -e "${YELLOW}⏳ Waiting for frontend to be ready...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:3001 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is ready${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}❌ Frontend failed to start${NC}"
    kill $API_PID $WEB_PID 2>/dev/null || true
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Give services a moment to fully stabilize
sleep 2

# Step 4: Run E2E tests (Run 1)
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  E2E Test Run #1${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

cd "$WEB_DIR"
npm exec -- playwright test --project=authenticated 2>&1 | tee /tmp/e2e-run1.log

RUN1_EXIT=$?
if [ $RUN1_EXIT -eq 0 ]; then
  echo -e "\n${GREEN}✅ Run #1: All tests passed${NC}"
else
  echo -e "\n${RED}❌ Run #1: Tests failed${NC}"
fi

# Wait a moment between runs
echo -e "\n${YELLOW}⏳ Waiting 5 seconds before second test run...${NC}"
sleep 5

# Step 5: Run E2E tests (Run 2)
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  E2E Test Run #2${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

npm exec -- playwright test --project=authenticated 2>&1 | tee /tmp/e2e-run2.log

RUN2_EXIT=$?
if [ $RUN2_EXIT -eq 0 ]; then
  echo -e "\n${GREEN}✅ Run #2: All tests passed${NC}"
else
  echo -e "\n${RED}❌ Run #2: Tests failed${NC}"
fi

# Step 6: Check typecheck, lint, and build
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Validation: typecheck, lint, and build${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📝 Typecheck...${NC}"
cd "$WEB_DIR"
npm run typecheck
TYPECHECK_EXIT=$?
if [ $TYPECHECK_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Typecheck passed${NC}"
else
  echo -e "${RED}❌ Typecheck failed${NC}"
fi

echo -e "\n${YELLOW}🔍 Lint...${NC}"
npm run lint
LINT_EXIT=$?
if [ $LINT_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Lint passed${NC}"
else
  echo -e "${RED}❌ Lint failed${NC}"
fi

echo -e "\n${YELLOW}🔨 Build...${NC}"
npm run build
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Build passed${NC}"
else
  echo -e "${RED}❌ Build failed${NC}"
fi

# Final report
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Final Report${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

OVERALL_EXIT=0

if [ $RUN1_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ E2E Test Run #1: PASSED${NC}"
else
  echo -e "${RED}❌ E2E Test Run #1: FAILED${NC}"
  OVERALL_EXIT=1
fi

if [ $RUN2_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ E2E Test Run #2: PASSED${NC}"
else
  echo -e "${RED}❌ E2E Test Run #2: FAILED${NC}"
  OVERALL_EXIT=1
fi

if [ $TYPECHECK_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Typecheck: PASSED${NC}"
else
  echo -e "${RED}❌ Typecheck: FAILED${NC}"
  OVERALL_EXIT=1
fi

if [ $LINT_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Lint: PASSED${NC}"
else
  echo -e "${RED}❌ Lint: FAILED${NC}"
  OVERALL_EXIT=1
fi

if [ $BUILD_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Build: PASSED${NC}"
else
  echo -e "${RED}❌ Build: FAILED${NC}"
  OVERALL_EXIT=1
fi

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"

if [ $OVERALL_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS AND VALIDATIONS PASSED${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS OR VALIDATIONS FAILED${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
  echo -e "${YELLOW}📊 Test Log Summary:${NC}"
  echo -e "${YELLOW}Run #1 Log: /tmp/e2e-run1.log${NC}"
  echo -e "${YELLOW}Run #2 Log: /tmp/e2e-run2.log${NC}\n"
  exit 1
fi
