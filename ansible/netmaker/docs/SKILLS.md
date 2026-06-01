# SKILLS.md - Required Skills for Netmaker Ansible Collection

This document outlines all technical and soft skills required to effectively contribute to and maintain the Netmaker Ansible Collection project. Skills are categorized by proficiency level and domain.

## Table of Contents

- [Essential Skills (Foundation)](#essential-skills-foundation)
- [Core Development Skills](#core-development-skills)
- [Advanced Development Skills](#advanced-development-skills)
- [DevOps & CI/CD Skills](#devops--cicd-skills)
- [Domain-Specific Knowledge](#domain-specific-knowledge)
- [Soft Skills](#soft-skills)
- [Skill Matrix by Task](#skill-matrix-by-task)
- [Learning Resources](#learning-resources)

---

## Essential Skills (Foundation)

These are mandatory skills needed to work on any part of the project.

### 1. Python Programming (Intermediate to Advanced)
**Required Level:** Intermediate (6/10)

**Used For:**
- Writing and maintaining the custom Ansible module (`plugins/modules/netmaker_management.py`)
- Understanding module logic and data flow
- Implementing API client wrapper class
- Handling exceptions and errors

**Specific Knowledge Needed:**
- Python 3.8+ syntax and features
- Object-oriented programming (classes, methods, inheritance)
- Dictionary and list comprehension
- Exception handling (`try/except/finally`)
- JSON parsing and manipulation
- Working with the `requests` library
- Type hints and type checking
- String formatting (f-strings)
- Boolean logic and conditionals
- Module imports and package structure

**Where Used:**
- `plugins/modules/netmaker_management.py` (693 lines of Python)
- GitHub Actions workflow (embedded Python scripts)
- `scripts/bump-version.sh` (calls Python for YAML/TOML parsing)

---

### 2. Ansible Fundamentals (Intermediate to Advanced)
**Required Level:** Intermediate (7/10)

**Used For:**
- Writing and maintaining playbooks
- Developing custom Ansible modules
- Understanding Ansible collections structure
- Publishing to Ansible Galaxy

**Specific Knowledge Needed:**
- **Playbook Development:**
  - YAML syntax for playbooks
  - Tasks, handlers, and roles
  - Variables and facts
  - Loops (`loop`, `with_items`)
  - Conditionals (`when`)
  - Registers and debug output
  - Check mode (`--check`, `supports_check_mode`)

- **Module Development:**
  - `AnsibleModule` class and API
  - Module argument specifications
  - Return values (`exit_json`, `fail_json`)
  - DOCUMENTATION/EXAMPLES/RETURN sections
  - `check_mode` implementation
  - Required/optional parameter handling
  - `no_log` for sensitive data

- **Ansible Collections:**
  - Collection structure and layout
  - `galaxy.yml` metadata file
  - Namespace and FQCN (Fully Qualified Collection Name)
  - `meta/runtime.yml` requirements
  - Build and publish process
  - Collection dependencies

**Where Used:**
- `plugins/modules/netmaker_management.py` - Custom module
- `playbooks/*.yml` - Working playbooks
- `galaxy.yml` - Collection metadata
- `meta/runtime.yml` - Runtime requirements
- `ansible.cfg` - Local development configuration

---

### 3. YAML Syntax (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Writing Ansible playbooks
- Configuring collection metadata
- Setting up GitHub Actions workflows

**Specific Knowledge Needed:**
- Key-value pairs and dictionaries
- Lists and arrays
- Multi-line strings (`|` and `>`)
- Anchors and aliases
- Boolean values (true/false, yes/no)
- Null values
- Comments
- Indentation rules (spaces, not tabs)
- YAML gotchas (quotes, special characters)

**Where Used:**
- All `*.yml` and `*.yaml` files
- `galaxy.yml`, `playbooks/*.yml`
- `.github/workflows/publish-collection.yml`
- `meta/runtime.yml`

---

### 4. Git & Version Control (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Managing code changes
- Collaborating with team
- Tracking history and reverting changes
- Managing releases

**Specific Knowledge Needed:**
- Basic commands: `clone`, `add`, `commit`, `push`, `pull`
- Branching and merging
- Commit message conventions
- `.gitignore` patterns
- Viewing history (`log`, `diff`, `blame`)
- Undoing changes (`reset`, `revert`, `restore`)
- Remote management (`remote`, `fetch`)
- SSH key authentication

**Where Used:**
- Entire project version control
- Release management
- Collaboration workflow
- `.gitignore` file

---

### 5. Linux/Unix Command Line (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Running playbooks and commands
- Navigating file system
- Managing permissions and environment
- Debugging and troubleshooting

**Specific Knowledge Needed:**
- File operations: `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`
- File viewing: `cat`, `less`, `head`, `tail`
- Text processing: `grep`, `sed`, `awk`, `cut`
- Permissions: `chmod`, `chown`
- Environment variables: `export`, `env`
- Process management: `ps`, `kill`, `jobs`
- Piping and redirection: `|`, `>`, `>>`
- Command substitution: `$(command)`
- WSL (Windows Subsystem for Linux) basics

**Where Used:**
- Running just commands
- Executing playbooks
- Running scripts
- Development workflow

---

## Core Development Skills

Skills needed for day-to-day development work.

### 6. REST API Integration (Intermediate)
**Required Level:** Intermediate (7/10)

**Used For:**
- Integrating with Netmaker API
- Handling HTTP requests and responses
- Authentication and authorization

**Specific Knowledge Needed:**
- HTTP methods: GET, POST, PUT, DELETE
- HTTP status codes (200, 201, 204, 400, 401, 404, 500)
- Request/response headers
- Bearer token authentication
- JSON payloads
- Error handling and retries
- SSL/TLS certificate validation
- API endpoint design
- Request library usage in Python

**Where Used:**
- `plugins/modules/netmaker_management.py` - `NetmakerAPI` class
- All API calls to Netmaker server
- Authentication logic

**Code Example Location:**
```python
# Lines 276-335 in netmaker_management.py
class NetmakerAPI:
    def _request(self, method, endpoint, data=None):
        # HTTP request implementation
```

---

### 7. JSON Data Handling (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- API request/response payloads
- Configuration data
- Data serialization

**Specific Knowledge Needed:**
- JSON syntax and structure
- Parsing JSON in Python (`json.loads`, `json.dumps`)
- Nested objects and arrays
- Type conversion
- Pretty printing
- Handling malformed JSON

**Where Used:**
- API request/response bodies
- Module return values
- Data comparison for idempotency

---

### 8. Modern Python Tooling (Intermediate)
**Required Level:** Intermediate (5/10)

**Used For:**
- Dependency management
- Virtual environments
- Project configuration

**Specific Knowledge Needed:**
- **UV Package Manager:**
  - `uv sync` for installing dependencies
  - `uv run` for running commands in virtual environment
  - Understanding `uv.lock` file

- **pyproject.toml:**
  - Project metadata section
  - Dependencies specification
  - Optional dependencies (dev)
  - Build system configuration

- **Virtual Environments:**
  - Creating and activating venvs
  - Installing packages
  - Isolation principles

**Where Used:**
- `pyproject.toml` - Project dependencies
- `uv.lock` - Locked dependencies
- `.venv/` directory
- All `just` commands that run `uv`

---

### 9. Just Task Runner (Basic to Intermediate)
**Required Level:** Basic (4/10)

**Used For:**
- Running common development tasks
- Automating workflows
- Standardizing commands

**Specific Knowledge Needed:**
- Justfile syntax
- Recipe definitions
- Recipe parameters
- Default recipe
- Comments and documentation
- Environment variables in recipes
- Running commands with `just <recipe>`
- Listing available recipes (`just` or `just --list`)

**Where Used:**
- `justfile` - All task automation
- Development workflow
- CI/CD helper commands

**Common Commands:**
```bash
just install          # Install dependencies
just create           # Create networks
just manage-devices   # Manage devices
just bump-version X.Y.Z  # Bump version
```

---

### 10. Bash Shell Scripting (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Writing automation scripts
- Version management
- CI/CD tasks

**Specific Knowledge Needed:**
- Shebang (`#!/bin/bash`)
- Variables and parameter expansion
- Conditionals (`if/then/else`)
- Loops (`for`, `while`)
- Functions
- Command substitution
- Exit codes (`set -e`, `exit 1`)
- Input/output redirection
- `read` for user input
- Regular expressions with `[[ ]]`
- Text processing (`sed`, `awk`, `grep`, `cut`)

**Where Used:**
- `scripts/bump-version.sh` - Version bumping script
- GitHub Actions inline scripts
- Justfile commands

**Interactive Script Example:**
```bash
# scripts/bump-version.sh uses interactive input:
read -p "Update both files to version $NEW_VERSION? (y/n) " -n 1 -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi
```

---

### 11. Markdown Documentation (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Writing documentation
- Creating README files
- Module documentation

**Specific Knowledge Needed:**
- Headers (`#`, `##`, `###`)
- Lists (ordered and unordered)
- Code blocks (inline and fenced)
- Links and references
- Tables
- Bold and italic text
- Task lists
- GitHub-flavored Markdown extensions

**Where Used:**
- `README.md` - Main documentation
- `CLAUDE.md` - AI assistant guide
- `docs/SKILLS.md` - This file
- `docs/netmaker_management_module.md` - Module docs

---

### 12. Idempotency Concepts (Intermediate)
**Required Level:** Intermediate (7/10)

**Used For:**
- Ensuring safe, repeatable operations
- State comparison logic
- Detecting when changes are needed

**Specific Knowledge Needed:**
- What idempotency means in IaC context
- Desired state vs current state comparison
- When to report `changed=true` vs `changed=false`
- Handling optional/default values in comparisons
- Comparing complex data structures
- Avoiding unnecessary updates

**Where Used:**
- `plugins/modules/netmaker_management.py`:
  - `networks_equal()` function (lines 412-446)
  - `extclients_equal()` function (lines 449-468)
  - State management in `manage_network()` and `manage_extclient()`

**Code Example:**
```python
def networks_equal(existing, desired):
    """Compare existing network with desired state"""
    # Compares only relevant fields, ignoring read-only fields
    # Returns True if no update needed, False if update required
```

---

## Advanced Development Skills

Skills needed for complex features and architectural decisions.

### 13. Ansible Module Development (Advanced)
**Required Level:** Advanced (8/10)

**Used For:**
- Creating custom modules
- Implementing complex module logic
- Following Ansible best practices

**Specific Knowledge Needed:**
- Module structure (DOCUMENTATION, EXAMPLES, RETURN, main())
- Argument spec validation
- Complex parameter requirements (`required_one_of`, `required_if`)
- Check mode implementation
- Diff mode support
- Module return values and structures
- Error handling and user-friendly messages
- Supporting both Python 2 and 3 (if needed)
- Missing library handling
- Module testing strategies

**Where Used:**
- `plugins/modules/netmaker_management.py` - Complete custom module

**Key Patterns:**
```python
module = AnsibleModule(
    argument_spec=dict(...),
    required_one_of=[['master_key', 'password']],
    required_if=[['resource_type', 'extclient', ['network']]],
    supports_check_mode=True
)
```

---

### 14. API Client Design (Advanced)
**Required Level:** Advanced (7/10)

**Used For:**
- Designing robust API wrappers
- Handling edge cases and errors
- Abstracting API complexity

**Specific Knowledge Needed:**
- Class-based API client design
- Method organization and naming
- Error handling strategies
- Retry logic
- Response parsing and validation
- Authentication flow
- Session management
- Rate limiting considerations
- Timeout handling
- Certificate validation

**Where Used:**
- `NetmakerAPI` class in `plugins/modules/netmaker_management.py`

**Design Example:**
```python
class NetmakerAPI:
    def __init__(self, base_url, token, validate_certs=True)
    def _request(self, method, endpoint, data=None)  # Private helper
    def get_network(self, network_id)  # Public methods
    def create_network(self, network_data)
    # ... more methods
```

---

### 15. State Machine Logic (Advanced)
**Required Level:** Advanced (7/10)

**Used For:**
- Managing resource lifecycle
- Implementing create/update/delete logic
- Handling state transitions

**Specific Knowledge Needed:**
- State machine concepts
- Current state detection
- Desired state vs actual state
- Transition logic (create, update, delete)
- Rollback strategies
- Atomic operations
- Check mode simulation

**Where Used:**
- `manage_network()` function - Network state management
- `manage_extclient()` function - Device state management
- Both implement: present/absent states with create/update/delete logic

---

### 16. Testing & Quality Assurance (Intermediate to Advanced)
**Required Level:** Intermediate (6/10)

**Used For:**
- Ensuring code quality
- Catching errors before production
- Maintaining standards

**Specific Knowledge Needed:**
- **Linting:**
  - ansible-lint for playbooks
  - yamllint for YAML files
  - Python linting (flake8, pylint, black)

- **Syntax Checking:**
  - `ansible-playbook --syntax-check`
  - Python syntax validation

- **Testing Approaches:**
  - Check mode testing (`--check` flag)
  - Dry-run testing
  - Integration testing with real API
  - Manual testing workflows

**Where Used:**
- `justfile` - `lint` command
- Development workflow
- Pre-commit checks

---

## DevOps & CI/CD Skills

Skills for automation, deployment, and operations.

### 17. GitHub Actions (Intermediate to Advanced)
**Required Level:** Intermediate (7/10)

**Used For:**
- Automated testing and publishing
- Release automation
- Version validation

**Specific Knowledge Needed:**
- **Workflow Syntax:**
  - YAML-based workflow files
  - Event triggers (`on: push`, `workflow_dispatch`)
  - Jobs and steps
  - Conditional execution (`if`)
  - Job dependencies (`needs`)

- **Actions Ecosystem:**
  - Using pre-built actions (`actions/checkout@v4`, etc.)
  - Action versioning
  - Marketplace actions

- **Secrets & Environment:**
  - GitHub secrets management
  - Environment variables
  - GITHUB_TOKEN usage
  - Custom secrets (ANSIBLE_GALAXY_TOKEN)

- **Advanced Features:**
  - Job outputs (`outputs`)
  - Matrix builds
  - Artifacts and caching
  - GitHub Releases API

**Where Used:**
- `.github/workflows/publish-collection.yml`:
  - Version checking job
  - Build and publish job
  - Automated releases

---

### 18. Semantic Versioning (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Managing releases
- Communicating changes
- Dependency management

**Specific Knowledge Needed:**
- Version format: MAJOR.MINOR.PATCH (X.Y.Z)
- When to bump major version (breaking changes)
- When to bump minor version (new features)
- When to bump patch version (bug fixes)
- Pre-release versions (alpha, beta, rc)
- Version constraints in dependencies

**Where Used:**
- `galaxy.yml` - Collection version
- `pyproject.toml` - Package version
- `scripts/bump-version.sh` - Version validation and bumping
- GitHub Releases

---

### 19. Release Management (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Publishing new versions
- Managing releases
- Distribution

**Specific Knowledge Needed:**
- Release workflow and process
- Changelog maintenance
- Release notes writing
- Git tagging
- Publishing to Ansible Galaxy
- GitHub Releases
- Version synchronization
- Rollback strategies

**Where Used:**
- GitHub Actions workflow
- `scripts/bump-version.sh`
- Manual release process

---

### 20. Secrets Management (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Protecting sensitive data
- Managing credentials
- Secure configuration

**Specific Knowledge Needed:**
- `.env` files for local secrets
- `.env.example` as templates
- `.gitignore` patterns for secrets
- GitHub Secrets
- Environment variable best practices
- Never committing secrets to git
- Ansible `no_log` parameter
- Credential rotation

**Where Used:**
- `.env` file (git-ignored)
- `.env.example` template
- Module parameters (master_key, password)
- GitHub Actions secrets
- `justfile` environment variable loading

**Security Pattern:**
```bash
# justfile loads secrets from .env
export NETMAKER_MASTER_KEY := `grep 'NETMAKER_MASTER_KEY=' .env | cut -d'=' -f2`
```

---

## Domain-Specific Knowledge

Specialized knowledge for this particular project domain.

### 21. WireGuard VPN (Intermediate)
**Required Level:** Intermediate (5/10)

**Used For:**
- Understanding network architecture
- Troubleshooting connectivity
- Configuration management

**Specific Knowledge Needed:**
- WireGuard basics (public/private keys, endpoints)
- Configuration file format
- Network interfaces
- Allowed IPs and routing
- Post-up/post-down scripts
- MTU considerations
- NAT traversal
- Keepalive settings

**Where Used:**
- External client configuration
- Network parameters in module
- Understanding Netmaker's purpose

---

### 22. Netmaker Platform (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Understanding target system
- API integration
- Feature implementation

**Specific Knowledge Needed:**
- **Netmaker Architecture:**
  - Networks (virtual WireGuard networks)
  - Nodes (servers running netclient)
  - External Clients (devices without netclient)
  - Ingress Gateways

- **Netmaker API:**
  - Authentication (master key, user/password)
  - Network management endpoints
  - External client endpoints
  - Node endpoints
  - API response formats
  - Error handling

- **Configuration:**
  - Network parameters (addressrange, MTU, DNS, keepalive)
  - External client configuration
  - Gateway discovery

**Where Used:**
- Entire module design
- API integration
- Documentation
- Understanding user needs

**API Reference:** https://docs.netmaker.io/api.html

---

### 23. Networking Fundamentals (Intermediate)
**Required Level:** Intermediate (5/10)

**Used For:**
- Understanding network configuration
- Troubleshooting connectivity
- Setting appropriate parameters

**Specific Knowledge Needed:**
- **IP Addressing:**
  - IPv4 and IPv6
  - CIDR notation (10.100.0.0/24)
  - Subnet masks
  - Private vs public ranges

- **Protocols:**
  - TCP/IP stack basics
  - UDP for WireGuard
  - DNS resolution

- **Concepts:**
  - MTU (Maximum Transmission Unit)
  - Routing and gateways
  - NAT (Network Address Translation)
  - VPN tunneling
  - Mesh networking

**Where Used:**
- Network configuration parameters
- Understanding addressrange parameter
- MTU settings
- DNS configuration

---

### 24. IoT & Edge Computing (Basic to Intermediate)
**Required Level:** Basic (4/10)

**Used For:**
- Understanding use cases
- Documentation and examples
- Feature prioritization

**Specific Knowledge Needed:**
- IoT device characteristics (resource-constrained)
- Edge computing concepts
- Device provisioning and management
- Common IoT protocols
- Security considerations for IoT
- Typical deployment scenarios

**Where Used:**
- Documentation and examples (IoT sensors, cameras)
- Understanding target audience
- Use case descriptions

---

## Soft Skills

Non-technical skills essential for effective collaboration.

### 25. Technical Writing (Intermediate)
**Required Level:** Intermediate (7/10)

**Used For:**
- Writing clear documentation
- Creating helpful examples
- User-facing communication

**Specific Knowledge Needed:**
- Clear, concise language
- Audience awareness (beginners vs experts)
- Structure and organization
- Examples and code snippets
- Troubleshooting sections
- Step-by-step instructions
- Avoiding jargon (or explaining it)

**Where Used:**
- README.md
- CLAUDE.md
- Module documentation
- Code comments
- Commit messages

---

### 26. Problem Solving & Debugging (Intermediate to Advanced)
**Required Level:** Intermediate (7/10)

**Used For:**
- Troubleshooting issues
- Root cause analysis
- Finding and fixing bugs

**Specific Knowledge Needed:**
- Systematic debugging approach
- Reading error messages and stack traces
- Using verbose output (`-vvv`)
- Log analysis
- Hypothesis testing
- Isolating variables
- Reproducing issues
- Documentation of findings

**Where Used:**
- Development and testing
- User support
- Issue resolution

**Debug Tools:**
```bash
just create-verbose   # Verbose output
just create-check     # Dry-run testing
```

---

### 27. Code Review & Collaboration (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Reviewing pull requests
- Giving constructive feedback
- Collaborating with team

**Specific Knowledge Needed:**
- Code review best practices
- Constructive feedback techniques
- Git pull request workflow
- Understanding coding standards
- Spotting common issues
- Security considerations
- Performance implications

**Where Used:**
- GitHub pull requests
- Team collaboration
- Quality assurance

---

### 28. Communication Skills (Intermediate)
**Required Level:** Intermediate (6/10)

**Used For:**
- Collaborating with team
- User support
- Documentation

**Specific Knowledge Needed:**
- Clear written communication
- Technical discussions
- Issue reporting
- Commit message conventions
- Documentation clarity
- Cross-cultural communication

**Where Used:**
- GitHub issues and discussions
- Commit messages
- Documentation
- Code comments

---

## Skill Matrix by Task

This matrix shows which skills are needed for common tasks.

### Task: Fix a Bug in the Module

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Python Programming | High (7/10) | Essential |
| Ansible Module Development | High (8/10) | Essential |
| Debugging | High (7/10) | Essential |
| Git | Medium (6/10) | Essential |
| API Integration | Medium (6/10) | Important |
| Netmaker Knowledge | Medium (5/10) | Important |
| Testing | Medium (6/10) | Important |

### Task: Add a New Module Parameter

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Python Programming | High (7/10) | Essential |
| Ansible Module Development | High (8/10) | Essential |
| API Integration | High (7/10) | Essential |
| Idempotency | High (7/10) | Essential |
| Documentation | Medium (6/10) | Essential |
| Netmaker API | Medium (6/10) | Important |
| Testing | Medium (6/10) | Important |

### Task: Write a New Playbook

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Ansible Fundamentals | High (7/10) | Essential |
| YAML | Medium (6/10) | Essential |
| Netmaker Knowledge | Medium (6/10) | Essential |
| WireGuard | Low (4/10) | Nice to have |
| Documentation | Medium (5/10) | Important |

### Task: Release a New Version

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Git | Medium (6/10) | Essential |
| Semantic Versioning | Medium (6/10) | Essential |
| Bash Scripting | Medium (5/10) | Essential |
| GitHub Actions | Low (4/10) | Important |
| Release Management | Medium (6/10) | Important |
| Documentation | Medium (5/10) | Important |

### Task: Update Documentation

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Technical Writing | High (7/10) | Essential |
| Markdown | Medium (6/10) | Essential |
| Understanding Project | Medium (5/10) | Essential |
| Git | Low (4/10) | Essential |

### Task: Troubleshoot User Issue

| Skill | Required Level | Priority |
|-------|----------------|----------|
| Problem Solving | High (7/10) | Essential |
| Ansible Knowledge | High (7/10) | Essential |
| Netmaker Knowledge | Medium (6/10) | Essential |
| Communication | Medium (6/10) | Essential |
| Debugging | High (7/10) | Important |
| WireGuard | Medium (5/10) | Important |

---

## Learning Resources

### Ansible
- **Official Docs:** https://docs.ansible.com/
- **Module Development Guide:** https://docs.ansible.com/ansible/latest/dev_guide/developing_modules_general.html
- **Collections Guide:** https://docs.ansible.com/ansible/latest/dev_guide/developing_collections.html
- **Ansible Galaxy:** https://galaxy.ansible.com/

### Python
- **Official Tutorial:** https://docs.python.org/3/tutorial/
- **Requests Library:** https://requests.readthedocs.io/
- **Python Module Development:** https://docs.python.org/3/tutorial/modules.html

### Netmaker
- **Official Documentation:** https://docs.netmaker.io/
- **API Reference:** https://docs.netmaker.io/api.html
- **GitHub Repository:** https://github.com/gravitl/netmaker

### WireGuard
- **Official Site:** https://www.wireguard.com/
- **Quick Start:** https://www.wireguard.com/quickstart/
- **Configuration:** https://www.wireguard.com/netns/

### DevOps Tools
- **UV Package Manager:** https://github.com/astral-sh/uv
- **Just Command Runner:** https://just.systems/
- **GitHub Actions:** https://docs.github.com/en/actions

### Networking
- **CIDR Calculator:** https://www.ipaddressguide.com/cidr
- **TCP/IP Guide:** https://www.tcpipguide.com/

### Git & GitHub
- **Pro Git Book:** https://git-scm.com/book/en/v2
- **GitHub Skills:** https://skills.github.com/

---

## Quick Reference: Minimum Skill Set

To make **basic contributions** (documentation, simple playbook changes):
1. ✅ YAML (Basic)
2. ✅ Markdown (Basic)
3. ✅ Git (Basic)
4. ✅ Ansible Fundamentals (Basic)

To **develop and maintain the module**:
1. ✅ Python (Intermediate to Advanced)
2. ✅ Ansible Module Development (Advanced)
3. ✅ REST API Integration (Intermediate)
4. ✅ Idempotency Concepts (Intermediate)
5. ✅ Testing & QA (Intermediate)
6. ✅ Netmaker API Knowledge (Intermediate)

To **manage releases and CI/CD**:
1. ✅ Git (Intermediate)
2. ✅ GitHub Actions (Intermediate)
3. ✅ Semantic Versioning (Intermediate)
4. ✅ Bash Scripting (Intermediate)
5. ✅ Release Management (Intermediate)

---

## Skill Development Path

### Beginner → Intermediate (3-6 months)
**Focus Areas:**
1. Master YAML and Ansible playbook basics
2. Learn Python fundamentals
3. Understand Git workflow
4. Practice writing documentation
5. Learn REST API concepts

**Recommended Tasks:**
- Update documentation
- Fix minor bugs
- Write simple playbooks
- Review code

### Intermediate → Advanced (6-12 months)
**Focus Areas:**
1. Deep dive into Ansible module development
2. Advanced Python patterns (OOP, error handling)
3. API client design
4. State management and idempotency
5. CI/CD and automation

**Recommended Tasks:**
- Develop module features
- Implement complex logic
- Design API interactions
- Set up CI/CD pipelines

---

**Last Updated:** 2025-10-16
**Project Version:** 1.0.3
**Maintained By:** Oriol Rius

For questions about skills or learning paths, open an issue on GitHub:
https://github.com/oriolrius/netmaker-ansible-automation/issues
