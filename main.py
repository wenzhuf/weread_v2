from datetime import datetime
from playwright.sync_api import sync_playwright
import time
import logging
import random
import json
import os
from push import push
from config import cookies, READ_NUM, PUSH_METHOD

# 配置日志格式
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)-8s - %(message)s')

READ_PAGE_URL = "https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2akf4b32ef025ef4b9ec30acd6"
READ_TIME_REPORT_URL = "https://weread.qq.com/web/book/read"

class ReadTracker:
    def __init__(self):
        self.total_read_time_in_seconds = 0
        self.total_read_attempt = 0

    def handle_request(self, request):
        if READ_TIME_REPORT_URL in request.url:
            payload_str = request.post_data
            if payload_str:
                try:
                    payload = json.loads(payload_str)
                    read_time = int(payload.get("rt", 0))
                    self.total_read_time_in_seconds += read_time
                    self.total_read_attempt += 1
                    logging.info(
                        f"⏱️ 第 {self.total_read_attempt} 次阅读成功, 阅读时间：{read_time}s, "
                        f"总计已阅读：{self.total_read_time_in_seconds // 60} 分钟..."
                    )
                except json.JSONDecodeError:
                    logging.error("⚠️ post_data 不是合法 JSON")

def main():
    logging.info(f"⏱️ 准备开始阅读！目标时长: {READ_NUM} 分钟...")

    tracker = ReadTracker()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="videos/",
            record_video_size={"width": 1280, "height": 720},
        )
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
        page.goto(READ_PAGE_URL)
        page.wait_for_timeout(5000)
        logging.info("⏱️ 目标网页已打开。")
        page.on("request", tracker.handle_request)

        while tracker.total_read_time_in_seconds < READ_NUM * 60:
            random_read_time = random.randint(28, 40)
            try:
                button = page.locator("button[class*='renderTarget_pager_button_right']")
                button.click(timeout=10000)
            except Exception as e:
                logging.error(f"点击失败，可能找不到按钮：{e}")
                # 创建目录（如果不存在）
                os.makedirs("screenshot", exist_ok=True)

                # 构造文件名（带时间戳）
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                screenshot_path = f"screenshot/fail_click_{timestamp}.png"

                # 截图
                page.screenshot(path=screenshot_path)
                logging.error(f"📸 已保存截图到 {screenshot_path}")
            time.sleep(random_read_time)

        browser.close()

    logging.info("🎉 阅读脚本已完成！")

    if PUSH_METHOD:
        logging.info("⏱️ 开始推送...")
        push(
            f"🎉 微信读书自动阅读完成！\n⏱️ 阅读时长：{tracker.total_read_time_in_seconds // 60} 分钟。",
            PUSH_METHOD
        )

main()
