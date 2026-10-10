import { expect, test } from "@playwright/test";

test("数据组件树局部更新不替换页面其他节点，失败初载显示兜底", async ({ page }) => {
  // 使用示例 factory 与真实 handler，测试只替换数据源，不伪造响应协议。
  const { createDataHandler } = await import("../data-source.mjs");
  let version = "1";
  let fail = false;
  const handler = createDataHandler(async () => {
    if (fail) throw Error("数据源中断");
    return { version, title: `产品介绍${version}` };
  });
  await page.route("**/ai-render/data-hero", async route => {
    const res = await handler(new Request(route.request().url()));
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  await page.goto("/data.html");
  const slot = page.locator('ai-slot[name="data-hero"]');
  await expect(slot).toContainText("产品介绍1");
  await page.locator("#outside").evaluate(el => el.setAttribute("data-marker", "same-node"));
  version = "2";
  await page.getByRole("button", { name: "刷新局部" }).click();
  await expect(slot).toContainText("产品介绍2");
  await expect(page.locator("#outside")).toHaveAttribute("data-marker", "same-node");
  fail = true;
  await page.reload();
  await expect(slot).toContainText("原始产品介绍");
});
