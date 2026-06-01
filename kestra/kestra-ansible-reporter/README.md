# Kestra Ansible Reporter

A simple command-line tool to fetch Ansible execution logs from a Kestra instance and generate a clean, human-readable HTML report.

## Prerequisites

- Python 3.10+
- `uv` package manager

## Installation

1.  **Clone the repository:**
    ```bash
    git clone ssh://git@git.oriolrius.cat:222/oriolrius/kestra-ansible-reporter.git
    cd kestra-ansible-reporter
    ```

2.  **Create a virtual environment and install dependencies:**
    It is recommended to use a compatible Python version (e.g., 3.11).
    ```bash
    uv venv --python python3.11
    source .venv/bin/activate
    uv pip install -e .
    ```

## Configuration

Copy `.env.example` to `.env` and update the values with your Kestra API settings:

```bash
cp .env.example .env
```

Then edit `.env` with your actual credentials:

```env
KESTRA_API_URL=http://your-kestra-instance:8080/api/v1
KESTRA_USER=your-username
KESTRA_PASSWORD=your-password
```

If the `.env` file is not present, default values will be used (localhost for URL, empty for credentials).

## Usage

The script requires two arguments: the Kestra execution ID and the desired path for the output HTML file.

```bash
create-report <execution-id> <output-html-file>
```

### Example

```bash
create-report 5opctfaXTMJImfVY7Q6fRv ./ansible-report.html
```

This command will fetch the logs for the specified execution, filter the Ansible output, and generate a file named `ansible-report.html` in the current directory.
