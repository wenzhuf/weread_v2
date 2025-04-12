from playwright.sync_api import sync_playwright
import time
import logging
import random
import json
from push import push
from config import cookies, READ_NUM, PUSH_METHOD

# 配置日志格式
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)-8s - %(message)s')

READ_PAGE_URL = "https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2akf4b32ef025ef4b9ec30acd6"
READ_TIME_REPORT_URL = "https://weread.qq.com/web/book/read"

total_read_time_in_seconds = 0
total_read_attempt = 0

def get_read_time(request):
    if READ_TIME_REPORT_URL in request.url:
        payload_str = request.post_data
        if payload_str:
            try:
                payload = json.loads(payload_str)
                read_time = int(payload["rt"])
                total_read_time_in_seconds += read_time
                logging.info(f"⏱️ 第 {total_read_attempt + 1} 次阅读成功, 阅读时间：{read_time}s, 总计已阅读：{total_read_time_in_seconds // 60}分钟...")
            except json.JSONDecodeError:
                logging.error("⚠️ post_data 不是合法 JSON")

def main():
    logging.info(f"⏱️ 准备开始阅读！目标时长: {READ_NUM}分钟...")
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
        page.on("request", get_read_time)

        while total_read_time_in_seconds < READ_NUM * 60:
            random_read_time = random.randint(28, 40)
            try:
                button = page.locator("button[class*='renderTarget_pager_button_right']")
                button.click(timeout=10000)  # 最多等待10秒找元素
            except Exception as e:
                logging.error("点击失败，可能找不到按钮：", e)
            time.sleep(random_read_time)
        browser.close()

    logging.info("🎉 阅读脚本已完成！")

    if PUSH_METHOD not in (None, ''):
        logging.info("⏱️ 开始推送...")
        push(f"🎉 微信读书自动阅读完成！\n⏱️ 阅读时长：{total_read_time_in_seconds // 60}分钟。", PUSH_METHOD)

main()