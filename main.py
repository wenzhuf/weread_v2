from datetime import datetime
from playwright.sync_api import sync_playwright
import time
import logging
import random
import json
import os
from push import push
from config import cookies, READ_NUM, PUSH_METHOD, LOG_LEVEL, READ_BOOK_LINK

# 配置日志格式
logger = logging.getLogger(__name__)
logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s - %(levelname)-8s - %(message)s')

READ_TIME_REPORT_URL = "https://weread.qq.com/web/book/read"

class ReadTracker:
    def __init__(self):
        self.total_read_time_in_seconds = 0
        self.total_read_attempt = 0
        self.last_read_report_time = time.time()

    def handle_request(self, request):
        if READ_TIME_REPORT_URL in request.url:
            payload_str = request.post_data
            logging.debug(payload_str)
            if payload_str:
                try:
                    payload = json.loads(payload_str)
                    read_time = int(payload.get("rt", 0))
                    if read_time > 0:
                        self.last_read_report_time = time.time()
                        self.total_read_time_in_seconds += read_time
                        self.total_read_attempt += 1
                        logging.info(
                            f"⏱️ 第 {self.total_read_attempt} 次阅读成功, 阅读时间：{read_time}s, "
                            f"总计已阅读：{self.total_read_time_in_seconds // 60} 分钟..."
                        )
                    if payload.get("reviews"):
                        logging.info(
                            f"点击到了一个review: {payload_str}"
                        )
                except json.JSONDecodeError:
                    logging.error("⚠️ post_data 不是合法 JSON")


def screenshot(page, is_periodic=False):
    # 构造文件名（带时间戳）
    if is_periodic:
        screenshot_path = "screenshot/last.png"  # 定期截图保存覆盖
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        screenshot_path = f"screenshot/fail_{timestamp}.png"
    # 截图
    page.screenshot(path=screenshot_path)
    if is_periodic:
        logging.info(f"🖼️ 定期截图已保存到 {screenshot_path}")
    else:
        logging.error(f"📸 异常时截图已保存到 {screenshot_path}")

def mimic_reading(page):
    for i in range(30):
        x = 100 + (200 - 100) * i / 30
        y = 100 + (200 - 100) * i / 30
        page.mouse.move(x, y)
        time.sleep(1 / 10)  # 每步约 33 毫秒，总共 1 秒钟
    page.mouse.click(200, 200) # 点2下鼠标
    time.sleep(5)
    page.mouse.click(200, 200)
    time.sleep(random.randint(20, 30))


def move_to_next_page(page):
    button = page.locator("button[class*='renderTarget_pager_button_right']")
    button.click(timeout=10000)


def update_github_summary(message: str):
    """
    Appends a message to the GitHub Actions job summary.

    Parameters:
    - message (str): The text to append. Markdown is supported.
    """
    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as f:
                f.write(message + "\n")
        except Exception as e:
            logging.warning(f"Failed to write to GitHub summary: {e}")
    else:
        logging.info("GITHUB_STEP_SUMMARY not set. Running outside of GitHub Actions?")


def main():
    logging.info(f"⏱️ 准备开始阅读！目标时长: {READ_NUM} 分钟...")
    logging.info(f"⏱️ 准备阅读：{READ_BOOK_LINK}")
    # 创建目录（如果不存在）
    os.makedirs("screenshot", exist_ok=True)
    tracker = ReadTracker()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
        context = browser.new_context()

        cookies_list = [
            {
                "name": name,
                "value": value,
                "domain": ".weread.qq.com",
                "path": "/"
            }
            for name, value in cookies.items()
        ]
        context.add_cookies(cookies_list)

        page = context.new_page()
        page.goto(READ_BOOK_LINK)
        page.wait_for_timeout(5000)
        logging.info("⏱️ 目标网页已打开。")
        page.on("request", tracker.handle_request)

        while tracker.total_read_time_in_seconds < READ_NUM * 60:
            screenshot(page, is_periodic=True) # periodically screenshot
            try:
                # Check if too much time has passed without a read report
                time_since_last_report = time.time() - tracker.last_read_report_time
                if time_since_last_report > 60:
                    logging.warning(f"⚠️ {int(time_since_last_report)}s 内无阅读上报，已截图")
                    screenshot(page)
                elif time_since_last_report > 120:
                    # 尝试刷新页面
                    logging.warning(f"⚠️ 120s 内无阅读上报，刷新页面...")
                    page.goto(READ_BOOK_LINK)
                    page.wait_for_timeout(5000)
                elif time_since_last_report > 600:
                    error_message = "⚠️ 120s 内无阅读上报，terminating..."
                    logging.critical(error_message)
                    raise RuntimeError(error_message)
                else:
                    move_to_next_page(page)
            except Exception as e:
                logging.error(f"点击失败，可能找不到按钮：{e}")
                screenshot(page)
            mimic_reading(page)

        browser.close()

    logging.info("🎉 阅读脚本已完成！")

    success_message = f"🎉 微信读书自动阅读完成！\n⏱️ 阅读时长：{tracker.total_read_time_in_seconds // 60} 分钟。"
    update_github_summary(success_message)
    if PUSH_METHOD:
        logging.info("⏱️ 开始推送...")
        push(success_message, PUSH_METHOD)

main()
