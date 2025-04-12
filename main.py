from playwright.sync_api import sync_playwright
import time
import logging
import random
from push import push
from config import cookies, READ_NUM, PUSH_METHOD

# 配置日志格式
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)-8s - %(message)s')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
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
    page.goto("https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2akf4b32ef025ef4b9ec30acd6")
    page.wait_for_timeout(5000)
    page.screenshot(path="screenshot.png")

    for index in range(READ_NUM):
        random_read_time = random.randint(28, 40)
        logging.info(f"⏱️ 尝试第 {index + 1} 次阅读, 时间：{random_read_time}s...")
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
    push(f"🎉 微信读书自动阅读完成！\n⏱️ 阅读时长：{total_ream_time_in_seconds // 60}分钟。", PUSH_METHOD)