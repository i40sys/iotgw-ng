#!/bin/bash
# SSH Key Testing Script for Cosmian KMS
# This script tests KMS-generated SSH keys in an isolated Docker environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KMS_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
COSMIAN="$KMS_DIR/contrib/cosmian"
KMS_URL="${KMS_URL:-http://localhost:9998}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
echo_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    echo_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo_error "Docker is not installed"
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        echo_error "Python3 is not installed"
        exit 1
    fi

    if ! curl -s "$KMS_URL/version" &> /dev/null; then
        echo_error "KMS is not running at $KMS_URL"
        exit 1
    fi

    echo_success "All prerequisites met"
}

# Create directories
setup_dirs() {
    echo_info "Setting up directories..."
    mkdir -p "$SCRIPT_DIR/keys"
    mkdir -p "$SCRIPT_DIR/authorized_keys_dir"
}

# Generate SSH keys in KMS and export them
generate_keys() {
    echo_info "Generating SSH keys in KMS..."

    # Generate unique key IDs based on timestamp
    TIMESTAMP=$(date +%s)
    ED25519_KEY_ID="ssh_test_ed25519_$TIMESTAMP"
    RSA_KEY_ID="ssh_test_rsa_$TIMESTAMP"

    # Create Ed25519 key
    echo_info "Creating Ed25519 key: $ED25519_KEY_ID"
    $COSMIAN --kms-url "$KMS_URL" kms ec keys create \
        --curve ed25519 \
        --tag ssh-docker-test \
        --tag ed25519 \
        "$ED25519_KEY_ID" > /dev/null

    # Create RSA key
    echo_info "Creating RSA 4096 key: $RSA_KEY_ID"
    $COSMIAN --kms-url "$KMS_URL" kms rsa keys create \
        --size_in_bits 4096 \
        --tag ssh-docker-test \
        --tag rsa \
        "$RSA_KEY_ID" > /dev/null

    # Export keys
    echo_info "Exporting keys from KMS..."
    $COSMIAN --kms-url "$KMS_URL" kms ec keys export \
        --key-id "$ED25519_KEY_ID" \
        --key-format pkcs8-pem \
        "$SCRIPT_DIR/keys/ed25519_pkcs8.pem" > /dev/null

    $COSMIAN --kms-url "$KMS_URL" kms rsa keys export \
        --key-id "$RSA_KEY_ID" \
        --key-format pkcs8-pem \
        "$SCRIPT_DIR/keys/rsa_pkcs8.pem" > /dev/null

    # Convert to OpenSSH format using Python
    echo_info "Converting keys to OpenSSH format..."
    python3 << 'PYTHON_SCRIPT'
import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

script_dir = os.environ.get('SCRIPT_DIR', '.')
keys_dir = os.path.join(script_dir, 'keys')

def convert_key(input_file, output_base, comment):
    with open(os.path.join(keys_dir, input_file), 'rb') as f:
        private_key = serialization.load_pem_private_key(
            f.read(), password=None, backend=default_backend()
        )

    # Private key in OpenSSH format
    openssh_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Public key in OpenSSH format
    public_key = private_key.public_key()
    openssh_public = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH
    )

    priv_path = os.path.join(keys_dir, output_base)
    pub_path = os.path.join(keys_dir, f"{output_base}.pub")

    with open(priv_path, 'wb') as f:
        f.write(openssh_private)
    os.chmod(priv_path, 0o600)

    with open(pub_path, 'wb') as f:
        f.write(openssh_public + f' {comment}\n'.encode())

    return pub_path

# Convert both keys
ed25519_pub = convert_key('ed25519_pkcs8.pem', 'id_ed25519', 'kms-ed25519-test')
rsa_pub = convert_key('rsa_pkcs8.pem', 'id_rsa', 'kms-rsa-test')

print(f"Converted: {ed25519_pub}")
print(f"Converted: {rsa_pub}")
PYTHON_SCRIPT

    # Create authorized_keys file with both public keys
    echo_info "Creating authorized_keys file..."
    cat "$SCRIPT_DIR/keys/id_ed25519.pub" > "$SCRIPT_DIR/authorized_keys"
    cat "$SCRIPT_DIR/keys/id_rsa.pub" >> "$SCRIPT_DIR/authorized_keys"
    chmod 644 "$SCRIPT_DIR/authorized_keys"

    echo_success "Keys generated and exported"

    # Store key IDs for cleanup
    echo "$ED25519_KEY_ID" > "$SCRIPT_DIR/.last_ed25519_key"
    echo "$RSA_KEY_ID" > "$SCRIPT_DIR/.last_rsa_key"
}

# Build Docker images
build_images() {
    echo_info "Building Docker images..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" build --quiet
    echo_success "Docker images built"
}

# Start containers
start_containers() {
    echo_info "Starting SSH test containers..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

    # Wait for SSH server to be ready
    echo_info "Waiting for SSH server to be ready..."
    sleep 3
    echo_success "Containers started"
}

# Run SSH tests
run_tests() {
    echo ""
    echo "============================================"
    echo "       SSH Key Authentication Tests        "
    echo "============================================"
    echo ""

    TESTS_PASSED=0
    TESTS_FAILED=0

    # Test 1: Ed25519 key authentication
    echo_info "Test 1: Ed25519 key authentication"
    if docker exec ssh-test-client ssh -i /home/testuser/.ssh/keys/id_ed25519 \
        -o BatchMode=yes \
        testuser@ssh-server "echo 'Ed25519 auth successful'" 2>/dev/null; then
        echo_success "Ed25519 key authentication: PASSED"
        ((TESTS_PASSED++))
    else
        echo_error "Ed25519 key authentication: FAILED"
        ((TESTS_FAILED++))
    fi

    # Test 2: RSA key authentication
    echo_info "Test 2: RSA 4096 key authentication"
    if docker exec ssh-test-client ssh -i /home/testuser/.ssh/keys/id_rsa \
        -o BatchMode=yes \
        testuser@ssh-server "echo 'RSA auth successful'" 2>/dev/null; then
        echo_success "RSA key authentication: PASSED"
        ((TESTS_PASSED++))
    else
        echo_error "RSA key authentication: FAILED"
        ((TESTS_FAILED++))
    fi

    # Test 3: Execute command via SSH with Ed25519
    echo_info "Test 3: Remote command execution (Ed25519)"
    RESULT=$(docker exec ssh-test-client ssh -i /home/testuser/.ssh/keys/id_ed25519 \
        -o BatchMode=yes \
        testuser@ssh-server "hostname" 2>/dev/null)
    if [ "$RESULT" == "ssh-test-server" ] || [ -n "$RESULT" ]; then
        echo_success "Remote command execution: PASSED (hostname: $RESULT)"
        ((TESTS_PASSED++))
    else
        echo_error "Remote command execution: FAILED"
        ((TESTS_FAILED++))
    fi

    # Test 4: Wrong key should fail
    echo_info "Test 4: Invalid key rejection (security test)"
    # Generate a temporary wrong key
    docker exec ssh-test-client sh -c "ssh-keygen -t ed25519 -f /tmp/wrong_key -N '' -q"
    if docker exec ssh-test-client ssh -i /tmp/wrong_key \
        -o BatchMode=yes \
        -o ConnectTimeout=5 \
        testuser@ssh-server "echo 'Should not see this'" 2>/dev/null; then
        echo_error "Invalid key rejection: FAILED (wrong key was accepted!)"
        ((TESTS_FAILED++))
    else
        echo_success "Invalid key rejection: PASSED (wrong key correctly rejected)"
        ((TESTS_PASSED++))
    fi

    # Test 5: Key fingerprint verification
    echo_info "Test 5: Key fingerprint verification"
    LOCAL_FP=$(ssh-keygen -lf "$SCRIPT_DIR/keys/id_ed25519.pub" 2>/dev/null | awk '{print $2}')
    CONTAINER_FP=$(docker exec ssh-test-client ssh-keygen -lf /home/testuser/.ssh/keys/id_ed25519.pub 2>/dev/null | awk '{print $2}')
    if [ "$LOCAL_FP" == "$CONTAINER_FP" ]; then
        echo_success "Key fingerprint verification: PASSED ($LOCAL_FP)"
        ((TESTS_PASSED++))
    else
        echo_error "Key fingerprint verification: FAILED"
        echo "  Local: $LOCAL_FP"
        echo "  Container: $CONTAINER_FP"
        ((TESTS_FAILED++))
    fi

    echo ""
    echo "============================================"
    echo "              Test Results                 "
    echo "============================================"
    echo -e "  ${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC} $TESTS_FAILED"
    echo "============================================"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo_success "All tests passed! KMS-generated SSH keys work correctly."
        return 0
    else
        echo_error "Some tests failed."
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo_info "Cleaning up..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v 2>/dev/null || true
    echo_success "Cleanup complete"
}

# Show key info
show_key_info() {
    echo ""
    echo "============================================"
    echo "           Generated Key Info              "
    echo "============================================"
    echo ""
    echo "Ed25519 Key:"
    ssh-keygen -lf "$SCRIPT_DIR/keys/id_ed25519.pub"
    echo ""
    echo "RSA 4096 Key:"
    ssh-keygen -lf "$SCRIPT_DIR/keys/id_rsa.pub"
    echo ""
    echo "Keys stored in KMS with tags: ssh-docker-test"
    echo "Local keys in: $SCRIPT_DIR/keys/"
    echo ""
}

# Main function
main() {
    case "${1:-test}" in
        test)
            check_prerequisites
            setup_dirs
            generate_keys
            build_images
            start_containers
            run_tests
            TEST_RESULT=$?
            show_key_info
            cleanup
            exit $TEST_RESULT
            ;;
        generate)
            check_prerequisites
            setup_dirs
            generate_keys
            show_key_info
            ;;
        start)
            build_images
            start_containers
            echo_info "Containers running. Use 'docker exec -it ssh-test-client sh' to access client."
            ;;
        stop)
            cleanup
            ;;
        clean)
            cleanup
            rm -rf "$SCRIPT_DIR/keys" "$SCRIPT_DIR/authorized_keys" "$SCRIPT_DIR/.last_*"
            echo_success "All test artifacts removed"
            ;;
        *)
            echo "Usage: $0 {test|generate|start|stop|clean}"
            echo ""
            echo "Commands:"
            echo "  test     - Run full test suite (default)"
            echo "  generate - Generate keys only"
            echo "  start    - Start containers without running tests"
            echo "  stop     - Stop and remove containers"
            echo "  clean    - Remove all test artifacts"
            exit 1
            ;;
    esac
}

# Export SCRIPT_DIR for Python
export SCRIPT_DIR

main "$@"
