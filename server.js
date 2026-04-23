require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// DATABASE CONNECTION
// ============================================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Kết nối MongoDB thành công'))
  .catch(err => console.error('❌ Lỗi MongoDB:', err));

// ============================================================
// MODELS
// ============================================================

// Product
const productSchema = new mongoose.Schema({
  sku: String,
  name: { type: String, required: true },
  cat: String,
  unit: String,
  emoji: { type: String, default: '📦' },
  cost: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  minStock: { type: Number, default: 10 },
  suppId: String,
  suppNm: String,
  desc: String
}, { timestamps: true });

// Customer
const customerSchema = new mongoose.Schema({
  id: String,
  name: { type: String, required: true },
  ph: String,
  ad: String,
  nt: String,
  total: { type: Number, default: 0 },
  debt: { type: Number, default: 0 }
}, { timestamps: true });

// Supplier
const supplierSchema = new mongoose.Schema({
  id: String,
  name: { type: String, required: true },
  ph: String,
  ct: String,
  ad: String
}, { timestamps: true });

// Order
const orderSchema = new mongoose.Schema({
  id: String,
  customer: String,
  customerId: String,
  date: String,
  items: String,
  total: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  status: { type: String, default: 'pending' },
  note: String,
  collected: { type: Number, default: 0 }
}, { timestamps: true });

// Return
const returnSchema = new mongoose.Schema({
  id: String,
  ordId: String,
  cust: String,
  date: String,
  items: String,
  val: Number,
  note: String
}, { timestamps: true });

// Cashflow
const cashflowSchema = new mongoose.Schema({
  id: String,
  type: String,
  date: String,
  desc: String,
  subject: String,
  amount: Number,
  method: String
}, { timestamps: true });

// Import (nhập hàng)
const importSchema = new mongoose.Schema({
  id: String,
  date: String,
  suppId: String,
  suppNm: String,
  prodId: String,
  prodNm: String,
  qty: Number,
  up: Number,
  total: Number
}, { timestamps: true });

// Collection (thu công nợ)
const collectionSchema = new mongoose.Schema({
  id: String,
  custId: String,
  cust: String,
  date: String,
  amount: Number,
  note: String
}, { timestamps: true });

// Settings
const settingsSchema = new mongoose.Schema({
  shopName: { type: String, default: 'LamThanh Store' },
  phone: String,
  addr: String,
  orderPrefix: { type: String, default: 'DH' },
  customerPrefix: { type: String, default: 'KH' },
  minStock: { type: Number, default: 10 },
  counters: {
    order: { type: Number, default: 1 },
    customer: { type: Number, default: 1 },
    supplier: { type: Number, default: 1 },
    cash: { type: Number, default: 1 },
    ret: { type: Number, default: 1 },
    imp: { type: Number, default: 1 },
    col: { type: Number, default: 1 }
  }
}, { timestamps: true });

const Product    = mongoose.model('Product', productSchema);
const Customer   = mongoose.model('Customer', customerSchema);
const Supplier   = mongoose.model('Supplier', supplierSchema);
const Order      = mongoose.model('Order', orderSchema);
const Return     = mongoose.model('Return', returnSchema);
const Cashflow   = mongoose.model('Cashflow', cashflowSchema);
const Import     = mongoose.model('Import', importSchema);
const Collection = mongoose.model('Collection', collectionSchema);
const Settings   = mongoose.model('Settings', settingsSchema);

// ============================================================
// HELPER: Get or create settings
// ============================================================
async function getSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

// ============================================================
// API ROUTES
// ============================================================

// --- SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try { res.json(await getSettings()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = new Settings();
    Object.assign(s, req.body);
    await s.save();
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
  try { res.json(await Product.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const p = await Product.create(req.body);
    // Nếu có số lượng nhập ban đầu, tạo bản ghi nhập kho
    if (req.body.stock > 0) {
      const s = await getSettings();
      await Import.create({
        id: 'NK' + s.counters.imp++,
        date: new Date().toLocaleDateString('vi-VN'),
        suppId: req.body.suppId || '',
        suppNm: req.body.suppNm || '',
        prodId: p._id.toString(),
        prodNm: req.body.name,
        qty: req.body.stock,
        up: req.body.cost || 0,
        total: (req.body.cost || 0) * req.body.stock
      });
      if ((req.body.cost || 0) * req.body.stock > 0) {
        await Cashflow.create({
          id: 'PC' + s.counters.cash++,
          type: 'Chi',
          date: new Date().toLocaleDateString('vi-VN'),
          desc: 'Nhập hàng: ' + req.body.name,
          subject: req.body.suppNm || 'NCC',
          amount: (req.body.cost || 0) * req.body.stock,
          method: '—'
        });
      }
      await s.save();
    }
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(p);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- CUSTOMERS ---
app.get('/api/customers', async (req, res) => {
  try { res.json(await Customer.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers', async (req, res) => {
  try {
    const s = await getSettings();
    const data = { ...req.body, id: s.settings?.customerPrefix || 'KH' + String(s.counters.customer++).padStart(3,'0') };
    await s.save();
    res.json(await Customer.create(data));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const c = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(c);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SUPPLIERS ---
app.get('/api/suppliers', async (req, res) => {
  try {
    const supps = await Supplier.find().sort({ createdAt: -1 });
    // Tính tổng nhập theo từng NCC
    const result = await Promise.all(supps.map(async s => {
      const total = await Import.aggregate([
        { $match: { suppId: s._id.toString() } },
        { $group: { _id: null, sum: { $sum: '$total' } } }
      ]);
      return { ...s.toObject(), totalImport: total[0]?.sum || 0 };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const s = await getSettings();
    const data = { ...req.body, id: 'NCC' + String(s.counters.supplier++).padStart(3,'0') };
    await s.save();
    res.json(await Supplier.create(data));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/suppliers/:id', async (req, res) => {
  try {
    res.json(await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- ORDERS ---
app.get('/api/orders', async (req, res) => {
  try { res.json(await Order.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const s = await getSettings();
    const oid = (s.orderPrefix || 'DH') + s.counters.order++;
    const order = await Order.create({ ...req.body, id: oid });
    // Cập nhật công nợ khách hàng
    if (req.body.customerId) {
      await Customer.findByIdAndUpdate(req.body.customerId, {
        $inc: { total: req.body.total, debt: req.body.total }
      });
    }
    // Tạo phiếu thu (công nợ)
    await Cashflow.create({
      id: 'PT' + s.counters.cash++,
      type: 'Thu',
      date: req.body.date || new Date().toLocaleDateString('vi-VN'),
      desc: 'Bán hàng #' + oid,
      subject: req.body.customer || 'Khách lẻ',
      amount: req.body.total,
      method: 'Công nợ'
    });
    // Trừ tồn kho
    if (req.body.stockUpdates) {
      for (const u of req.body.stockUpdates) {
        await Product.findByIdAndUpdate(u.id, { $inc: { stock: -u.qty } });
      }
    }
    await s.save();
    res.json(order);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    res.json(await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- RETURNS ---
app.get('/api/returns', async (req, res) => {
  try { res.json(await Return.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/returns', async (req, res) => {
  try {
    const s = await getSettings();
    const ret = await Return.create({ ...req.body, id: 'TR' + s.counters.ret++ });
    // Trừ công nợ khách hàng
    if (req.body.customerId) {
      const c = await Customer.findById(req.body.customerId);
      if (c) {
        c.debt = Math.max(0, (c.debt || 0) - req.body.val);
        await c.save();
      }
    }
    // Cập nhật collected trên đơn hàng gốc
    if (req.body.ordDbId) {
      const o = await Order.findById(req.body.ordDbId);
      if (o) { o.collected = (o.collected || 0) + req.body.val; await o.save(); }
    }
    // Ghi chi phí
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: req.body.date,
      desc: 'Trả hàng đơn #' + req.body.ordId,
      subject: req.body.cust,
      amount: req.body.val,
      method: 'Trừ công nợ'
    });
    await s.save();
    res.json(ret);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- COLLECTIONS (Thu công nợ) ---
app.get('/api/collections', async (req, res) => {
  try { res.json(await Collection.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/collections', async (req, res) => {
  try {
    const s = await getSettings();
    const cust = await Customer.findById(req.body.custDbId);
    if (!cust) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    const actual = Math.min(req.body.amount, cust.debt || 0);
    cust.debt = Math.max(0, (cust.debt || 0) - actual);
    await cust.save();
    const col = await Collection.create({
      id: 'TN' + s.counters.col++,
      custId: req.body.custDbId,
      cust: cust.name,
      date: req.body.date,
      amount: actual,
      note: req.body.note
    });
    // Tạo phiếu thu
    await Cashflow.create({
      id: 'PT' + s.counters.cash++,
      type: 'Thu',
      date: req.body.date,
      desc: 'Thu công nợ KH ' + cust.name,
      subject: cust.name,
      amount: actual,
      method: req.body.method || 'Tiền mặt'
    });
    // Cập nhật collected trên đơn hàng
    let rem = actual;
    const orders = await Order.find({ customerId: req.body.custDbId }).sort({ createdAt: 1 });
    for (const o of orders) {
      if (rem <= 0) break;
      const due = o.total - (o.collected || 0);
      if (due <= 0) continue;
      const take = Math.min(due, rem);
      o.collected = (o.collected || 0) + take;
      await o.save();
      rem -= take;
    }
    await s.save();
    res.json({ col, actualAmount: actual });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- CASHFLOW ---
app.get('/api/cashflow', async (req, res) => {
  try { res.json(await Cashflow.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cashflow', async (req, res) => {
  try {
    const s = await getSettings();
    const prefix = req.body.type === 'Thu' ? 'PT' : 'PC';
    const cf = await Cashflow.create({ ...req.body, id: prefix + s.counters.cash++ });
    await s.save();
    res.json(cf);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- IMPORTS (Nhập kho) ---
app.get('/api/imports', async (req, res) => {
  try { res.json(await Import.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/imports', async (req, res) => {
  try {
    const s = await getSettings();
    const items = req.body.items || [];
    const suppId = req.body.suppId;
    const suppNm = req.body.suppNm;
    const date = req.body.date;
    const created = [];
    let totalVal = 0;
    for (const item of items) {
      const imp = await Import.create({
        id: 'NK' + s.counters.imp++,
        date, suppId, suppNm,
        prodId: item.id,
        prodNm: item.name,
        qty: item.q,
        up: item.up,
        total: item.q * item.up
      });
      // Cộng tồn kho
      await Product.findByIdAndUpdate(item.id, { $inc: { stock: item.q } });
      totalVal += item.q * item.up;
      created.push(imp);
    }
    // Ghi chi phí
    if (totalVal > 0) {
      await Cashflow.create({
        id: 'PC' + s.counters.cash++,
        type: 'Chi',
        date,
        desc: 'Nhập hàng ' + items.map(i => i.name).join(', '),
        subject: suppNm || '—',
        amount: totalVal,
        method: '—'
      });
    }
    await s.save();
    res.json(created);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DASHBOARD STATS ---
app.get('/api/stats', async (req, res) => {
  try {
    const [orders, customers, products, cashflow, collections] = await Promise.all([
      Order.find(),
      Customer.find(),
      Product.find(),
      Cashflow.find(),
      Collection.find()
    ]);
    const totalRev = orders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
    const totalDebt = customers.reduce((s, c) => s + (c.debt || 0), 0);
    const totalCost = cashflow.filter(c => c.type === 'Chi').reduce((s, c) => s + c.amount, 0);
    const lowStock = products.filter(p => p.stock <= (p.minStock || 10)).length;
    res.json({ totalRev, totalDebt, totalCost, lowStock, orderCount: orders.length, customerCount: customers.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- RESET ALL DATA ---
app.delete('/api/reset-all', async (req, res) => {
  try {
    await Promise.all([
      Product.deleteMany({}),
      Customer.deleteMany({}),
      Supplier.deleteMany({}),
      Order.deleteMany({}),
      Return.deleteMany({}),
      Cashflow.deleteMany({}),
      Import.deleteMany({}),
      Collection.deleteMany({}),
    ]);
    // Reset counters
    await Settings.updateMany({}, { $set: { counters: { order:1, customer:1, supplier:1, cash:1, ret:1, imp:1, col:1 } } });
    res.json({ ok: true, message: 'Đã xóa toàn bộ dữ liệu' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SERVE FRONTEND ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname,'index-final.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 LamThanh Server chạy tại http://localhost:${PORT}`);
});
