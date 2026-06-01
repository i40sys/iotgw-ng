import sys
import requests
import os
import html
import argparse
from dotenv import load_dotenv
from string import Template

load_dotenv()

KESTRA_API_URL = os.getenv("KESTRA_API_URL", "http://localhost:8080/api/v1")
KESTRA_USER = os.getenv("KESTRA_USER", "")
KESTRA_PASSWORD = os.getenv("KESTRA_PASSWORD", "")

def fetch_logs(execution_id):
    """Fetches the logs for a given Kestra execution ID."""
    url = f"{KESTRA_API_URL}/logs/{execution_id}"
    try:
        response = requests.get(url, auth=(KESTRA_USER, KESTRA_PASSWORD))
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching logs: {e}", file=sys.stderr)
        sys.exit(1)

def filter_ansible_logs(logs):
    """Filters for Ansible-specific log entries."""
    ansible_logs = []
    for log in logs:
        if log.get("thread", "").startswith("docker-java-stream"):
            ansible_logs.append(log)
    return ansible_logs

def get_css_class(message):
    """Determines the CSS class for a log message based on its content."""
    msg_lower = message.lower()
    if msg_lower.startswith("play "): return "ansible-play"
    if msg_lower.startswith("task "): return "ansible-task"
    if msg_lower.startswith("play recap"): return "ansible-recap"
    if "ok=" in msg_lower: return "ansible-ok"
    if "changed=" in msg_lower: return "ansible-changed"
    if "fatal:" in msg_lower or "failed=" in msg_lower: return "ansible-failed"
    return "ansible-default"

def generate_html_report(logs, execution_id, output_path):
    """Generates a collapsible HTML log report."""
    # Load HTML template
    template_path = os.path.join(os.path.dirname(__file__), "template.html")
    with open(template_path, "r", encoding="utf-8") as f:
        template_content = f.read()
    
    HTML_TEMPLATE = Template(template_content)
    
    log_blocks_html = []
    
    i = 0
    while i < len(logs):
        log = logs[i]
        message = log.get("message", "")
        if not message.strip():
            i += 1
            continue

        # If it's a TASK, create a collapsible block
        if message.lower().startswith("task "):
            header_html = f"""
            <div class="log-line task-header" onclick="toggle(this)">
                <span class="log-timestamp">{log.get("timestamp", "")}</span>
                <span class="log-message ansible-task">{html.escape(message)}</span>
            </div>
            """
            
            content_lines = []
            i += 1
            # Collect all lines until the next TASK or PLAY RECAP
            while i < len(logs) and not logs[i].get("message", "").lower().startswith("task ") and not logs[i].get("message", "").lower().startswith("play recap"):
                content_log = logs[i]
                content_message = content_log.get("message", "")
                if content_message.strip():
                    css_class = get_css_class(content_message)
                    escaped_message = html.escape(content_message)
                    content_lines.append(f"""
                    <div class="log-line">
                        <span class="log-timestamp">{content_log.get("timestamp", "")}</span>
                        <span class="log-message {css_class}">{escaped_message}</span>
                    </div>
                    """)
                i += 1
            
            content_html = f'<div class="task-content">{"".join(content_lines)}</div>'
            log_blocks_html.append(header_html + content_html)
        
        # Otherwise, just render a normal line
        else:
            css_class = get_css_class(message)
            escaped_message = html.escape(message)
            log_blocks_html.append(f"""
            <div class="log-line">
                <span class="log-timestamp">{log.get("timestamp", "")}</span>
                <span class="log-message {css_class}">{escaped_message}</span>
            </div>
            """)
            i += 1

    html_content = HTML_TEMPLATE.substitute(
        execution_id=execution_id,
        log_blocks="".join(log_blocks_html)
    )

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"Successfully generated HTML report: {output_path}")
    except IOError as e:
        print(f"Error writing HTML file: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Generate HTML reports from Kestra Ansible execution logs.",
        prog="create-report"
    )
    parser.add_argument(
        "execution_id",
        help="The Kestra execution ID to fetch logs from"
    )
    parser.add_argument(
        "output_file",
        help="Path to the output HTML file"
    )

    args = parser.parse_args()

    execution_id = args.execution_id
    output_path = args.output_file

    print(f"Fetching logs for execution ID: {execution_id}")
    all_logs = fetch_logs(execution_id)

    print("Filtering Ansible task output...")
    ansible_logs = filter_ansible_logs(all_logs)

    if not ansible_logs:
        print("No Ansible task output found in the logs.", file=sys.stderr)
        sys.exit(1)

    print(f"Generating HTML report at {output_path}...")
    generate_html_report(ansible_logs, execution_id, output_path)

if __name__ == "__main__":
    main()
