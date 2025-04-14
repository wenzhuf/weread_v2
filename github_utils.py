import os
import logging

logger = logging.getLogger(__name__)


def update_github_summary(message: str):
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as f:
                f.write(message + "\n")
        except Exception as e:
            logging.warning(f"Failed to write to GitHub summary: {e}")
    else:
        logging.warning("GITHUB_STEP_SUMMARY not set. Running outside of GitHub Actions?")


def update_github_output(key: str, value: str):
    output_file = os.getenv("GITHUB_OUTPUT")
    if output_file:
        try:
            with open(output_file, "a", encoding="utf-8") as f:
                cleaned_value = value.replace('\n', ' ')
                f.write(f"{key}={cleaned_value}\n")
        except Exception as e:
            logging.warning(f"Failed to write to GitHub output: {e}")
    else:
        logging.warning("GITHUB_OUTPUT not set. Running outside of GitHub Actions?")