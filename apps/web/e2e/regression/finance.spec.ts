import { test, expect } from '../fixtures/test';
import { API_URL, ROUTES, gotoApp, waitForHeading, apiGet } from '../helpers';

test.describe('regression · finance', () => {
  test('admin creates an invoice through the UI', async ({ page, asAdmin, adminTokens, request }) => {
    void asAdmin;
    const invoices = await apiGet(request, '/invoices?limit=5', adminTokens.accessToken);
    expect(invoices.status).toBe(200);

    const companyName = `Regression Invoice ${Date.now()}`;
    const customerResponse = await request.post(`${API_URL}/customers`, {
      headers: { Authorization: `Bearer ${adminTokens.accessToken}` },
      data: { companyName, contactName: 'Regression Customer' },
    });
    expect(customerResponse.status()).toBe(201);

    await gotoApp(page, ROUTES.finance);
    await waitForHeading(page, /financial|finance|invoice/i);
    await page.getByRole('tab', { name: 'Invoices' }).click();
    await page.getByRole('button', { name: 'New Invoice' }).click();

    const dialog = page.getByRole('dialog', { name: 'Create Invoice' });
    await dialog.getByRole('combobox').first().selectOption({ label: companyName });
    await dialog.getByPlaceholder('Description').fill('Regression freight charge');
    await dialog.getByPlaceholder('Qty').fill('2');
    await dialog.getByPlaceholder('Unit price').fill('125');
    await dialog.getByRole('button', { name: 'Create Invoice' }).click();

    await expect(page.getByText('Invoice created')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Invoices' }).getByText(companyName)).toBeVisible();
  });
});
