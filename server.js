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
  desc: String,
  batches: { type: Array, default: [] }  // FIFO: [{qty, cost, date, impId}]
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
  collected: { type: Number, default: 0 },
  payType: { type: String, default: '' },
  duedate: { type: String, default: '' },
  ckList: { type: [Number], default: [] },
  stockUpdates: { type: Array, default: [] },
}, { timestamps: true });

// Return
const returnSchema = new mongoose.Schema({
  id: String,
  ordId: String,
  cust: String,
  date: String,
  items: String,
  val: Number,
  note: String,
  customerId: String,
  ordDbId: String,
  retType: { type: String, default: '' },
  returnItems: { type: Array, default: [] },
  adj: { type: Array, default: [] }   // ghi lại đơn nào bị trừ bao nhiêu để xóa/sửa phiếu hoàn ngược đúng
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
  items: { type: Array, default: [] },
  qty: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
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
  shopName: { type: String, default: '' },
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
    const payType = req.body.payType || 'conno';
    const isTM = payType === 'tienmat';
    const total = req.body.total || 0;

    // Tạo đơn hàng - nếu thu tiền mặt thì collected = total
    const order = await Order.create({
      ...req.body,
      id: oid,
      collected: isTM ? total : 0
    });

    if (isTM) {
      // Thu tiền mặt: tạo phiếu thu, cộng total nhưng KHÔNG cộng debt
      if (req.body.customerId) {
        let cust = null;
        try { cust = await Customer.findById(req.body.customerId); } catch(e) {}
        if (!cust) cust = await Customer.findOne({ id: req.body.customerId });
        if (cust) {
          cust.total = (cust.total || 0) + total;
          // debt không đổi vì đã thu tiền
          await cust.save();
        }
      }
      await Cashflow.create({
        id: 'PT' + s.counters.cash++,
        type: 'Thu',
        date: req.body.date || new Date().toLocaleDateString('vi-VN'),
        desc: 'Thu tiền mặt đơn #' + oid + ' - ' + (req.body.customer || 'Khách lẻ'),
        subject: req.body.customer || 'Khách lẻ',
        amount: total,
        method: 'Tiền mặt'
      });
    } else if (req.body.customerId) {
      // Công nợ: cộng debt + total
      let cust = null;
      try { cust = await Customer.findById(req.body.customerId); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ id: req.body.customerId });
      if (cust) {
        cust.debt = (cust.debt || 0) + total;
        cust.total = (cust.total || 0) + total;
        await cust.save();
      }
    }
    // Trừ tồn kho theo FIFO - lấy lô cũ nhất trước
    if (req.body.stockUpdates) {
      for (const u of req.body.stockUpdates) {
        const prod = await Product.findById(u.id);
        if (!prod) continue;
        let remain = u.qty;
        const batches = prod.batches || [];
        // Trừ từ lô đầu tiên (cũ nhất) trước
        for (let i = 0; i < batches.length && remain > 0; i++) {
          if (batches[i].qty <= remain) {
            remain -= batches[i].qty;
            batches[i].qty = 0;
          } else {
            batches[i].qty -= remain;
            remain = 0;
          }
        }
        // Xóa lô đã hết
        const updatedBatches = batches.filter(b => b.qty > 0);
        await Product.findByIdAndUpdate(u.id, {
          $inc: { stock: -u.qty },
          $set: { batches: updatedBatches }
        });
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
    const order = await Order.findById(req.params.id);
    if (order && order.customerId) {
      const debt = order.total - (order.collected || 0);
      if (debt > 0) {
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { debt: -debt, total: -order.total }
        });
      } else {
        await Customer.findByIdAndUpdate(order.customerId, {
          $inc: { total: -order.total }
        });
      }
      // Hoàn lại tồn kho
      if (order.stockUpdates) {
        for (const u of order.stockUpdates) {
          await Product.findByIdAndUpdate(u.id, { $inc: { stock: u.qty } });
        }
      }
    }
    await Order.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// --- RETURNS ---
app.get('/api/returns', async (req, res) => {
  try { res.json(await Return.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ===== TRẢ HÀNG =====
// Mỗi phiếu trả ghi lại (adj) đơn nào bị trừ bao nhiêu -> xóa/sửa phiếu hoàn ngược chính xác.
// Công nợ khách luôn tính lại từ đơn hàng, không cộng/trừ dồn.
async function findCust(id) {
  if (!id) return null;
  let c = null;
  try { c = await Customer.findById(id); } catch (e) {}
  if (!c) c = await Customer.findOne({ id });
  return c;
}
async function custOrdersDesc(cust) {
  const ids = [cust._id.toString()];
  if (cust.id) ids.push(cust.id);
  return Order.find({ customerId: { $in: ids }, status: 'delivered' }).sort({ createdAt: -1 });
}
async function recalcCustDebt(custId) {
  const c = await findCust(custId);
  if (!c) return;
  const ords = await custOrdersDesc(c);
  c.debt = ords.reduce((s, o) => s + Math.max(0, (o.total || 0) - (o.collected || 0)), 0);
  await c.save();
}
async function bumpCustTotal(custId, delta) {
  const c = await findCust(custId);
  if (!c) return;
  c.total = Math.max(0, (c.total || 0) + delta);
  await c.save();
}
async function inferRetType(ret) {
  if (ret.retType) return ret.retType;
  const cf = await Cashflow.findOne({ subject: ret.cust, date: ret.date, amount: ret.val, method: 'Tiền mặt' });
  return cf ? 'tienmat' : 'congno';
}
// Trừ giá trị hàng trả vào đơn hàng. Trả về danh sách điều chỉnh để hoàn ngược sau này.
async function applyReturnAdj(data) {
  const retVal = Number(data.val) || 0;
  const isCash = data.retType === 'tienmat';
  const adj = [];
  if (retVal <= 0) return adj;
  let orders = [];
  if (data.ordDbId) {
    let o = null;
    try { o = await Order.findById(data.ordDbId); } catch (e) {}
    if (o) orders = [o];
  }
  if (!orders.length && data.customerId) {
    const cust = await findCust(data.customerId);
    if (cust) orders = await custOrdersDesc(cust);
  }
  let rem = retVal;
  const cut = async (ord, d, dc) => {
    ord.total = (ord.total || 0) - d;
    if (dc) ord.collected = (ord.collected || 0) - dc;
    await ord.save();
    adj.push({ orderId: ord._id.toString(), total: d, collected: dc || 0 });
    rem -= d;
  };
  if (isCash) {
    // Trả tiền mặt: hoàn lại tiền đã thu -> giảm cả tổng đơn lẫn số đã thu bằng nhau (công nợ không đổi)
    for (const ord of orders) {
      if (rem <= 0) break;
      const d = Math.min(ord.collected || 0, ord.total || 0, rem);
      if (d <= 0) continue;
      await cut(ord, d, d);
    }
    // Còn dư (trả nhiều hơn số đã thu): trừ tổng đơn
    for (const ord of orders) {
      if (rem <= 0) break;
      const d = Math.min(ord.total || 0, rem);
      if (d <= 0) continue;
      await cut(ord, d, 0);
    }
  } else {
    // Trừ công nợ: ưu tiên các đơn còn nợ (mới nhất trước) để công nợ giảm đúng bằng giá trị hàng trả
    for (const ord of orders) {
      if (rem <= 0) break;
      const out = (ord.total || 0) - (ord.collected || 0);
      if (out <= 0) continue;
      await cut(ord, Math.min(out, rem), 0);
    }
    for (const ord of orders) {
      if (rem <= 0) break;
      const d = Math.min(ord.total || 0, rem);
      if (d <= 0) continue;
      await cut(ord, d, 0);
    }
  }
  return adj;
}
// Hoàn ngược phần đã trừ vào đơn hàng của một phiếu trả
async function reverseReturnAdj(ret) {
  if (Array.isArray(ret.adj) && ret.adj.length) {
    for (const a of ret.adj) {
      let o = null;
      try { o = await Order.findById(a.orderId); } catch (e) {}
      if (!o) continue;
      o.total = (o.total || 0) + (a.total || 0);
      if (a.collected) o.collected = (o.collected || 0) + a.collected;
      await o.save();
    }
    return;
  }
  // Phiếu cũ (tạo trước khi có adj): ước lượng = đơn mới nhất của khách tạo trước phiếu trả
  const val = Number(ret.val) || 0;
  if (val <= 0) return;
  let cust = ret.customerId ? await findCust(ret.customerId) : null;
  if (!cust && ret.cust) cust = await Customer.findOne({ name: ret.cust });
  if (!cust) return;
  const type = await inferRetType(ret);
  const ords = await custOrdersDesc(cust);
  const before = ret.createdAt ? new Date(ret.createdAt).getTime() : Infinity;
  const ord = ords.find(o => !o.createdAt || new Date(o.createdAt).getTime() <= before) || ords[0];
  if (!ord) return;
  ord.total = (ord.total || 0) + val;
  if (type === 'tienmat') ord.collected = (ord.collected || 0) + val;
  await ord.save();
}
async function restockReturn(items, date, retId) {
  for (const item of (items || [])) {
    if (item.productId && item.qty > 0) {
      const prod = await Product.findById(item.productId);
      if (prod) {
        const lastBatch = prod.batches && prod.batches.length > 0 ? prod.batches[prod.batches.length - 1] : null;
        const returnCost = lastBatch ? lastBatch.cost : (prod.cost || item.price || 0);
        const newBatch = { qty: Number(item.qty), cost: returnCost, date, impId: 'TR-' + retId };
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: Number(item.qty) }, $push: { batches: newBatch } });
      }
    }
  }
}
async function unstockReturn(ret) {
  for (const item of (ret.returnItems || [])) {
    if (item.productId && item.qty > 0) {
      const prod = await Product.findById(item.productId);
      if (prod) {
        const updatedBatches = (prod.batches || []).filter(b => b.impId !== 'TR-' + ret.id);
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -Number(item.qty) }, $set: { batches: updatedBatches } });
      }
    }
  }
}

app.post('/api/returns', async (req, res) => {
  try {
    const s = await getSettings();
    const ret = await Return.create({ ...req.body, id: 'TR' + s.counters.ret++ });
    const retVal = Number(req.body.val) || 0;
    const isCash = req.body.retType === 'tienmat';
    ret.adj = await applyReturnAdj(req.body);
    await ret.save();
    if (isCash && req.body.customerId) await bumpCustTotal(req.body.customerId, -retVal);
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: req.body.date,
      desc: isCash ? 'Trả tiền mặt hàng trả — ' + req.body.cust : 'Trừ công nợ hàng trả — ' + req.body.cust,
      subject: req.body.cust,
      amount: req.body.val,
      method: isCash ? 'Tiền mặt' : 'Trừ công nợ'
    });
    await restockReturn(req.body.returnItems, req.body.date, ret.id);
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: req.body.date,
      desc: 'Trả hàng đơn #' + req.body.ordId,
      subject: req.body.cust,
      amount: req.body.val,
      method: 'Hoàn trả'
    });
    if (req.body.customerId) await recalcCustDebt(req.body.customerId);
    await s.save();
    res.json(ret);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/returns/:id', async (req, res) => {
  try {
    const old = await Return.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Không tìm thấy phiếu trả' });
    const oldType = await inferRetType(old);
    // 1. Hoàn ngược dữ liệu cũ
    await unstockReturn(old);
    await reverseReturnAdj(old);
    if (oldType === 'tienmat' && old.customerId) await bumpCustTotal(old.customerId, Number(old.val) || 0);
    await Cashflow.deleteMany({ type: 'Chi', subject: old.cust, date: old.date, amount: old.val });
    // 2. Áp dụng dữ liệu mới
    const newData = req.body;
    await restockReturn(newData.returnItems, newData.date, old.id);
    const adj = await applyReturnAdj(newData);
    if (newData.retType === 'tienmat' && newData.customerId) await bumpCustTotal(newData.customerId, -(Number(newData.val) || 0));
    const s = await getSettings();
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: newData.date,
      desc: newData.retType === 'tienmat' ? 'Trả tiền mặt hàng trả — ' + newData.cust : 'Trừ công nợ hàng trả — ' + newData.cust,
      subject: newData.cust,
      amount: newData.val,
      method: newData.retType === 'tienmat' ? 'Tiền mặt' : 'Trừ công nợ'
    });
    await s.save();
    const updated = await Return.findByIdAndUpdate(req.params.id, { ...newData, adj }, { new: true });
    const cids = new Set([old.customerId, newData.customerId].filter(Boolean));
    for (const cid of cids) await recalcCustDebt(cid);
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/returns/:id', async (req, res) => {
  try {
    const ret = await Return.findById(req.params.id);
    if (!ret) return res.status(404).json({ error: 'Không tìm thấy phiếu trả' });
    const type = await inferRetType(ret);
    await unstockReturn(ret);
    await reverseReturnAdj(ret);
    let cust = ret.customerId ? await findCust(ret.customerId) : null;
    if (!cust && ret.cust) cust = await Customer.findOne({ name: ret.cust });
    if (cust && type === 'tienmat') { cust.total = (cust.total || 0) + (Number(ret.val) || 0); await cust.save(); }
    await Cashflow.deleteMany({ type: 'Chi', subject: ret.cust, date: ret.date, amount: ret.val });
    await Return.findByIdAndDelete(req.params.id);
    if (cust) await recalcCustDebt(cust._id.toString());
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SỬA TỔNG ĐƠN bị trừ dư do phiếu trả hàng đã xóa trước đây ---
// Xem trước: /api/repair-return-totals?name=Hậu Nhi   | Áp dụng: thêm &apply=1
app.get('/api/repair-return-totals', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu ?name=tên khách' });
    const apply = req.query.apply === '1';
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const custs = await Customer.find({ name: { $regex: esc, $options: 'i' } });
    const out = [];
    for (const c of custs) {
      const ords = await custOrdersDesc(c);
      const rets = await Return.find({ cust: c.name });
      const explained = rets.reduce((sum, r) => sum + (Number(r.val) || 0), 0);
      const rows = [];
      let gapSum = 0;
      for (const o of ords) {
        const items = String(o.items || '').split(', ');
        let gross = 0, ok = items.length > 0;
        for (const it of items) {
          const m = it.match(/^(.+)×([\d.]+)×([\d.]+)$/);
          if (!m) { ok = false; break; }
          gross += parseFloat(m[2]) * parseFloat(m[3]);
        }
        if (!ok) continue;
        const net = Math.round((gross - (o.discount || 0)) * 100) / 100;
        const gap = Math.max(0, Math.round((net - (o.total || 0)) * 100) / 100);
        if (gap > 1) { rows.push({ o, gap }); gapSum += gap; }
      }
      // phần bị trừ dư = tổng chênh lệch - giá trị các phiếu trả hiện còn
      let orphan = Math.max(0, gapSum - explained);
      const plan = [];
      for (const r of rows) {
        if (orphan <= 0) break;
        const add = Math.min(r.gap, orphan);
        plan.push({ o: r.o, add });
        orphan -= add;
      }
      const addById = {};
      for (const p of plan) addById[p.o.id] = p.add;
      const debtNow = ords.reduce((sum, o) => sum + Math.max(0, (o.total || 0) - (o.collected || 0)), 0);
      const debtAfter = ords.reduce((sum, o) => sum + Math.max(0, (o.total || 0) + (addById[o.id] || 0) - (o.collected || 0)), 0);
      if (apply) {
        for (const p of plan) { p.o.total = (p.o.total || 0) + p.add; await p.o.save(); }
        c.debt = debtAfter;
        await c.save();
      }
      out.push({
        khach: c.name,
        daApDung: apply,
        noHienTai: debtNow,
        noSauKhiSua: debtAfter,
        tongTienDonBiGiamSoVoiHang: gapSum,
        giaTriPhieuTraHienCon: explained,
        donCanSua: plan.map(p => ({ don: p.o.id, tongHienTai: p.o.total - (apply ? p.add : 0), congThem: p.add, tongSauKhiSua: (p.o.total - (apply ? p.add : 0)) + p.add }))
      });
    }
    res.json(out);
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
    let cust = null;
    try { cust = await Customer.findById(req.body.custDbId); } catch(e) {}
    if (!cust) cust = await Customer.findOne({ id: req.body.custDbId });
    if (!cust) return res.status(404).json({ error: 'Không tìm thấy khách hàng: ' + req.body.custDbId });

    // Query orders bằng cả _id lẫn id
    const custIds = [cust._id.toString()];
    if (cust.id) custIds.push(cust.id);

    const custOrders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' });
    const totalOrdered = custOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalCollected = custOrders.reduce((s, o) => s + (o.collected || 0), 0);
    const realDebt = Math.max(0, totalOrdered - totalCollected);
    const actual = Math.min(Number(req.body.amount) || 0, realDebt > 0 ? realDebt : (cust.debt || 0));
    if (actual <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ hoặc khách không có nợ (nợ thực: ' + realDebt + ')' });

    cust.debt = Math.max(0, realDebt - actual);
    await cust.save();

    const col = await Collection.create({
      id: 'TN' + s.counters.col++,
      custId: cust._id.toString(),
      cust: cust.name,
      date: req.body.date,
      amount: actual,
      note: req.body.note
    });
    await Cashflow.create({
      id: 'PT' + s.counters.cash++,
      type: 'Thu',
      date: req.body.date,
      desc: 'Thu công nợ KH ' + cust.name,
      subject: cust.name,
      amount: actual,
      method: req.body.method || 'Tiền mặt'
    });

    // Cập nhật collected trên đơn hàng (query bằng cả 2 id)
    let rem = actual;
    const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' }).sort({ createdAt: 1 });
    for (const o of orders) {
      if (rem <= 0) break;
      const due = (o.total || 0) - (o.collected || 0);
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

// --- PUT/DELETE CASHFLOW ---
app.put('/api/cashflow/:id', async (req, res) => {
  try {
    const cf = await Cashflow.findById(req.params.id);
    if (!cf) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
    const oldAmt = cf.amount;
    const newAmt = Number(req.body.amount) || oldAmt;
    const diff = newAmt - oldAmt; // chênh lệch
    // Nếu là phiếu thu công nợ → điều chỉnh debt khách hàng
    if (cf.type === 'Thu' && cf.desc && cf.desc.includes('Thu công nợ')) {
      let cust = null;
      try { cust = await Customer.findById(cf.subject); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ name: cf.subject });
      if (cust) {
        cust.debt = Math.max(0, (cust.debt || 0) - diff);
        await cust.save();
      }
    }
    await Cashflow.findByIdAndUpdate(req.params.id, { ...req.body, amount: newAmt });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cashflow/:id', async (req, res) => {
  try {
    const cf = await Cashflow.findById(req.params.id);
    if (!cf) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

    // Nếu là phiếu thu công nợ → xóa Collection + hoàn nợ + reset collected
    if (cf.type === 'Thu' && cf.desc && cf.desc.includes('Thu công nợ')) {
      // Tìm tất cả collections liên quan (cùng ngày, cùng subject)
      const cols = await Collection.find({ date: cf.date, cust: cf.subject });
      const colMatch = cols.find(c => c.amount === cf.amount) || cols[0];

      let custId = colMatch ? colMatch.custId : null;
      let cust = null;

      // Tìm khách
      if (custId) {
        try { cust = await Customer.findById(custId); } catch(e) {}
        if (!cust) cust = await Customer.findOne({ id: custId });
      }
      if (!cust) cust = await Customer.findOne({ name: cf.subject });

      if (cust) {
        const amount = cf.amount || 0;
        // Hoàn nợ
        cust.debt = (cust.debt || 0) + amount;
        await cust.save();
        // Hoàn collected trên orders
        if (amount > 0) {
          let rem = amount;
          const orders = await Order.find({
            $or: [
              { customerId: cust._id.toString() },
              { customerId: cust.id }
            ],
            status: 'delivered'
          }).sort({ createdAt: -1 });
          for (const o of orders) {
            if (rem <= 0) break;
            const canReturn = Math.min(o.collected || 0, rem);
            if (canReturn > 0) {
              o.collected = Math.max(0, (o.collected || 0) - canReturn);
              await o.save();
              rem -= canReturn;
            }
          }
        }
      }

      // Xóa Collection tương ứng
      if (colMatch) await Collection.findByIdAndDelete(colMatch._id);
      else await Collection.deleteMany({ date: cf.date, cust: cf.subject, amount: cf.amount });
    }

    await Cashflow.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
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
    let totalVal = 0;

    // Tạo 1 phiếu nhập duy nhất chứa tất cả sản phẩm
    const impId = 'NK' + s.counters.imp++;
    await s.save();

    for (const item of items) {
      if (!item.id || !item.q) continue;
      const newBatch = { qty: Number(item.q), cost: Number(item.up)||0, date: date, impId: impId };
      const result = await Product.findByIdAndUpdate(item.id, {
        $inc: { stock: Number(item.q) },
        $push: { batches: newBatch }
      }, { new: true });
      if (!result) console.warn('Không tìm thấy SP:', item.id, item.name);
      else console.log('Cập nhật tồn kho:', item.name, '+', item.q, '→', result.stock);
      totalVal += Number(item.q) * Number(item.up||0);
    }

    const imp = await Import.create({
      id: impId,
      date, suppId, suppNm,
      items: items,
      qty: items.reduce((s,i) => s + i.q, 0),
      total: totalVal
    });

    // Ghi phiếu chi
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
      await s.save();
    }

    res.json(imp);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// --- PUT/DELETE IMPORTS ---
app.put('/api/imports/:id', async (req, res) => {
  try {
    const oldImp = await Import.findById(req.params.id);
    const imp = await Import.findByIdAndUpdate(req.params.id, req.body, { new: true });
    // Cập nhật lại batches trong products khi sửa giá nhập
    const newItems = req.body.items || [];
    const impId = oldImp ? (oldImp.id || req.params.id) : req.params.id;
    for (const item of newItems) {
      const prod = await Product.findById(item.id);
      if (!prod) continue;
      // Tìm batch có impId khớp và cập nhật cost mới
      let changed = false;
      const batches = (prod.batches || []).map(b => {
        if (b.impId === impId) {
          changed = true;
          return { ...b, cost: Number(item.up) || b.cost, qty: b.qty };
        }
        return b;
      });
      if (changed) {
        await Product.findByIdAndUpdate(item.id, { $set: { batches } });
      }
    }
    res.json(imp);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/imports/:id', async (req, res) => {
  try {
    const imp = await Import.findById(req.params.id);
    if (!imp) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    // Hoàn lại tồn kho và xóa batches tương ứng
    for (const item of (imp.items || [])) {
      const prod = await Product.findById(item.id);
      if (!prod) continue;
      // Xóa batch có impId trùng với imp.id
      const updatedBatches = (prod.batches || []).filter(b => b.impId !== imp.id);
      await Product.findByIdAndUpdate(item.id, {
        $inc: { stock: -item.q },
        $set: { batches: updatedBatches }
      });
    }
    await Import.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DELETE COLLECTION ---
app.delete('/api/collections/:id', async (req, res) => {
  try {
    const col = await Collection.findById(req.params.id);
    if (!col) return res.status(404).json({ error: 'Không tìm thấy' });
    const amount = col.amount || 0;
    if (amount > 0) {
      // Hoàn nợ khách
      let cust = null;
      try { cust = await Customer.findById(col.custId); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ name: col.cust });
      if (cust) {
        cust.debt = (cust.debt || 0) + amount;
        await cust.save();
        // Hoàn collected trên orders
        let rem = amount;
        const orders = await Order.find({ customerId: cust._id.toString(), status: 'delivered' }).sort({ createdAt: -1 });
        for (const o of orders) {
          if (rem <= 0) break;
          const back = Math.min(o.collected || 0, rem);
          if (back > 0) { o.collected = Math.max(0, (o.collected||0) - back); await o.save(); rem -= back; }
        }
      }
    }
    await Collection.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SYNC STOCK: Tính lại tồn kho từ imports - orders - returns ---
app.post('/api/sync-stock', async (req, res) => {
  try {
    const products = await Product.find();
    const imports = await Import.find();
    const orders = await Order.find({ status: 'delivered' });
    const returns = await Return.find();
    let updated = 0;

    for (const p of products) {
      const pid = p._id.toString();
      const pname = p.name;

      // Tổng nhập - tìm theo _id hoặc tên sản phẩm
      let totIn = 0;
      for (const imp of imports) {
        for (const item of (imp.items || [])) {
          const itemId = (item.id || item.productId || '').toString();
          const itemName = (item.name || '').trim();
          if (itemId === pid || itemName === pname) {
            totIn += Number(item.q || item.qty || 0);
          }
        }
      }

      // Tổng xuất (bán) - parse đúng format Tên×SL hoặc Tên×SL×Giá
      let totOut = 0;
      for (const o of orders) {
        const parts = (o.items || '').split(', ');
        for (const part of parts) {
          // Bắt tên SP, tránh nhầm ×SL×Giá
          const m3 = part.match(/^(.+)×([\d.]+)×[\d.]+$/);
          const m2 = part.match(/^(.+)×([\d.]+)$/);
          const m = m3 || m2;
          if (m && m[1].trim() === pname) {
            totOut += parseFloat(m[2]) || 0;
          }
        }
      }

      // Tổng trả hàng (hoàn kho) - theo _id hoặc tên
      let totRet = 0;
      for (const r of returns) {
        for (const item of (r.returnItems || [])) {
          const itemId = (item.productId || '').toString();
          const itemName = (item.name || '').trim();
          if (itemId === pid || itemName === pname) {
            totRet += Number(item.qty || 0);
          }
        }
      }

      const newStock = Math.max(0, totIn - totOut + totRet);
      if (p.stock !== newStock) {
        console.log(`Sync ${pname}: nhập=${totIn} bán=${totOut} trả=${totRet} → ${newStock} (cũ: ${p.stock})`);
        p.stock = newStock;
        await p.save();
        updated++;
      }
    }
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Reset collected về 0 cho đơn (khi đánh dấu sai) ---
app.post('/api/orders/:id/mark-unpaid', async (req, res) => {
  try {
    const o = await Order.findOne({ id: req.params.id });
    if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    const prev = o.collected || 0;
    o.collected = 0;
    await o.save();
    // Cập nhật debt của khách
    if (o.customerId) {
      let cust = null;
      try { cust = await Customer.findById(o.customerId); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ id: o.customerId });
      if (cust) {
        cust.debt = (cust.debt || 0) + prev;
        await cust.save();
      }
    }
    res.json({ ok: true, orderId: o.id, collected: 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Đánh dấu đơn đã thu đủ ---
app.post('/api/orders/:id/mark-paid', async (req, res) => {
  try {
    const o = await Order.findOne({ id: req.params.id });
    if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn' });
    const prev = o.collected || 0;
    o.collected = o.total;
    await o.save();
    // Cập nhật debt của khách
    if (o.customerId) {
      let cust = null;
      try { cust = await Customer.findById(o.customerId); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ id: o.customerId });
      if (cust) {
        cust.debt = Math.max(0, (cust.debt || 0) - ((o.total || 0) - prev));
        await cust.save();
      }
    }
    res.json({ ok: true, orderId: o.id, collected: o.collected });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DEBUG: Xem format ngày đơn hàng ---
app.get('/api/debug-dates', async (req, res) => {
  try {
    const orders = await Order.find({ status: 'delivered' }).sort({ createdAt: -1 }).limit(10);
    res.json(orders.map(o => ({ id: o.id, date: o.date, total: o.total })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DEBUG: Xem đơn có duedate ---
app.get('/api/debug-duedate', async (req, res) => {
  try {
    const orders = await Order.find({ duedate: { $exists: true, $ne: '' } }).limit(20);
    const all = await Order.find().sort({ createdAt: -1 }).limit(5);
    res.json({
      orders_with_duedate: orders.map(o=>({ id:o.id, duedate:o.duedate, payType:o.payType, total:o.total, collected:o.collected })),
      latest_5_orders: all.map(o=>({ id:o.id, duedate:o.duedate, payType:o.payType, date:o.date }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DEBUG: Xem tất cả customers và debt ---
app.get('/api/debug-all-debt', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ debt: -1 });
    const result = await Promise.all(customers.filter(c=>(c.debt||0)>0).map(async c => {
      const custIds = [c._id.toString()];
      if (c.id) custIds.push(c.id);
      const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' });
      const calc = orders.reduce((s,o)=>{
        const col = o.collected!=null?o.collected:0;
        return s + Math.max(0,(o.total||0)-col);
      },0);
      return {
        name: c.name,
        _id: c._id.toString(),
        id: c.id,
        debt_db: c.debt,
        calc_debt: calc,
        so_don: orders.length,
        orders: orders.map(o=>({id:o.id,total:o.total,collected:o.collected,payType:o.payType,customerId:o.customerId}))
      };
    }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DEBUG collections của khách ---
app.get('/api/debug-col/:custName', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.custName);
    const custs = await Customer.find({ name: { $regex: name, $options: 'i' } });
    const result = [];
    for (const c of custs) {
      const custIds = [c._id.toString()];
      if (c.id) custIds.push(c.id);
      const cols = await Collection.find({ custId: { $in: custIds } }).sort({ date: 1 });
      const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' }).sort({ date: 1 });
      const debt = orders.reduce((s, o) => {
        const col = o.collected != null ? o.collected : 0;
        if (col >= (o.total || 0)) return s;
        return s + Math.max(0, (o.total || 0) - col);
      }, 0);
      result.push({
        customer: c.name,
        _id: c._id.toString(),
        id: c.id,
        debt_in_db: c.debt,
        calc_debt: debt,
        tong_collections: cols.reduce((s,x)=>s+x.amount,0),
        collections: cols.map(x=>({ id:x.id, date:x.date, amount:x.amount, custId:x.custId })),
        orders: orders.map(o=>({
          id: o.id, date: o.date,
          total: o.total, collected: o.collected,
          payType: o.payType,
          customerId: o.customerId,
          still_owe: Math.max(0,(o.total||0)-(o.collected||0))
        }))
      });
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- DEBUG: Xem dữ liệu orders của khách ---
app.get('/api/debug-debt/:custName', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.custName);
    const custs = await Customer.find({ name: { $regex: name, $options: 'i' } });
    const result = [];
    for (const c of custs) {
      const custIds = [c._id.toString()];
      if (c.id) custIds.push(c.id);
      const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' });
      result.push({
        customer: c.name,
        _id: c._id,
        id: c.id,
        debt_in_db: c.debt,
        orders: orders.map(o => ({
          id: o.id,
          date: o.date,
          total: o.total,
          collected: o.collected,
          payType: o.payType,
          customerId: o.customerId,
          still_owe: Math.max(0, (o.total||0) - (o.collected||0))
        })),
        calc_debt: orders.reduce((s,o) => s + Math.max(0,(o.total||0)-(o.collected||0)), 0)
      });
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- KHÔI PHỤC số đã thu theo file backup ---
// Dựng lại: số đã thu của từng đơn = như trong backup, rồi áp lại các khoản Thu công nợ ghi SAU ngày backup
// (theo thứ tự đơn cũ trước). Không phụ thuộc vào số đã thu hiện tại nên chạy lại nhiều lần vẫn cho cùng kết quả.
// apply=false: chỉ xem trước. apply=true: ghi vào đơn hàng và cập nhật nợ khách.
app.post('/api/restore-collected', async (req, res) => {
  try {
    const list = Array.isArray(req.body.orders) ? req.body.orders : [];
    const apply = req.body.apply === true;
    const bkTime = req.body.backupDate ? new Date(req.body.backupDate) : null;
    if (!list.length) return res.status(400).json({ error: 'File backup không có đơn hàng' });
    if (!bkTime || isNaN(bkTime.getTime())) return res.status(400).json({ error: 'File backup không có ngày giờ sao lưu (_meta.date)' });
    const bk = {};
    for (const b of list) {
      if (b && b.id != null && isFinite(Number(b.collected))) bk[String(b.id)] = Number(b.collected);
    }
    // nợ từng khách ghi trong file backup (để đối chiếu)
    const bkDebt = {};
    for (const c of (Array.isArray(req.body.customers) ? req.body.customers : [])) {
      if (!c) continue;
      if (c._id) bkDebt['i:' + c._id] = c.debt || 0;
      if (c.id) bkDebt['i:' + c.id] = c.debt || 0;
      if (c.name) bkDebt['n:' + c.name] = c.debt || 0;
    }
    const customers = await Customer.find();
    const khach = [];
    const orderUpdates = [];
    const custUpdates = [];
    let tongTruoc = 0, tongSau = 0, soDonThayDoi = 0, khongDoi = 0, soDonTimThay = 0;
    for (const c of customers) {
      const ids = [c._id.toString()];
      if (c.id) ids.push(c.id);
      const ords = await Order.find({ customerId: { $in: ids }, status: 'delivered' }).sort({ createdAt: 1 });
      const inBk = ords.filter(o => bk[o.id] != null);
      if (!inBk.length) continue;
      soDonTimThay += inBk.length;
      // 1) trạng thái gốc theo backup
      const st = {};
      for (const o of ords) {
        if (bk[o.id] != null) st[o.id] = Math.min(bk[o.id], o.total || 0);
        else if (o.payType === 'tienmat') st[o.id] = o.total || 0;                              // đơn mới thu tiền mặt
        else if (!o.payType && (o.collected || 0) >= (o.total || 0) && (o.total || 0) > 0) st[o.id] = o.total || 0;
        else st[o.id] = 0;
      }
      // 2) áp lại các khoản thu ghi sau ngày backup (đơn cũ trước)
      const cols = (await Collection.find({ custId: { $in: ids } }).sort({ createdAt: 1 }))
        .filter(x => x.createdAt && new Date(x.createdAt).getTime() > bkTime.getTime());
      for (const col of cols) {
        let rem = Number(col.amount) || 0;
        for (const o of ords) {
          if (rem <= 0) break;
          const due = (o.total || 0) - st[o.id];
          if (due <= 0) continue;
          const take = Math.min(due, rem);
          st[o.id] += take;
          rem -= take;
        }
      }
      let truoc = 0, sau = 0, soDon = 0;
      for (const o of ords) {
        const cur = o.collected || 0;
        truoc += Math.max(0, (o.total || 0) - cur);
        sau += Math.max(0, (o.total || 0) - st[o.id]);
        if (Math.abs(st[o.id] - cur) > 0.5) { soDon++; orderUpdates.push({ o, to: st[o.id] }); }
      }
      if (soDon === 0 && Math.abs(truoc - sau) < 0.5 && Math.abs((c.debt || 0) - sau) < 0.5) { khongDoi++; continue; }
      const noBk = bkDebt['i:' + c._id.toString()] ?? (c.id ? bkDebt['i:' + c.id] : undefined) ?? bkDebt['n:' + c.name];
      khach.push({ name: c.name, noBackup: noBk == null ? null : noBk, noTruoc: truoc, noSau: sau, soDon });
      custUpdates.push({ c, sau });
      tongTruoc += truoc; tongSau += sau; soDonThayDoi += soDon;
    }
    if (apply) {
      for (const u of orderUpdates) { u.o.collected = u.to; await u.o.save(); }
      for (const u of custUpdates) { u.c.debt = u.sau; await u.c.save(); }
    }
    khach.sort((a, b) => Math.abs(b.noSau - b.noTruoc) - Math.abs(a.noSau - a.noTruoc));
    res.json({
      ok: true, applied: apply,
      soDonTrongFile: Object.keys(bk).length,
      soDonTimThay, soDonThayDoi, khongDoi,
      khach, tongTruoc, tongSau
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- SYNC ALL: chỉ tính lại nợ từ dữ liệu hiện có (không reset collected; total đã trừ hàng trả) ---
app.post('/api/sync-all', async (req, res) => {
  try {
    // Bước 1: Đơn tiền mặt -> collected = total (KHÔNG reset collected của đơn khác)
    await Order.updateMany({ payType: 'tienmat' }, [{ $set: { collected: '$total' } }]);

    // Bước 2: Tính lại debt cho tất cả khách
    const customers = await Customer.find();
    let updated = 0;
    for (const c of customers) {
      const custIds = [c._id.toString()];
      if (c.id) custIds.push(c.id);
      const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' });
      const debt = orders.reduce((s, o) => {
        const col = o.collected != null ? o.collected : 0;
        if (col >= (o.total || 0)) return s; // đã thu đủ
        return s + Math.max(0, (o.total || 0) - col);
      }, 0);
      c.debt = debt;
      await c.save();
      updated++;
    }
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SYNC DEBT ---
app.post('/api/sync-debt', async (req, res) => {
  try {
    const customers = await Customer.find();
    let count = 0;
    for (const c of customers) {
      const custIds = [c._id.toString()];
      if (c.id) custIds.push(c.id);
      const orders = await Order.find({ customerId: { $in: custIds }, status: 'delivered' });
      const debt = orders.reduce((s, o) => {
        const col = o.collected != null ? o.collected : 0;
        return s + Math.max(0, (o.total || 0) - col);
      }, 0);
      if (c.debt !== debt) { c.debt = debt; await c.save(); count++; }
    }
    res.json({ ok: true, updated: count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- FIFO HELPER: tính giá vốn FIFO cho 1 sản phẩm với số lượng bán ---
// Dùng để tính lợi nhuận chính xác theo từng lô nhập
function calcFifoCost(batches, qtyNeeded) {
  let cost = 0;
  let remain = qtyNeeded;
  for (const b of batches) {
    if (remain <= 0) break;
    const take = Math.min(b.qty, remain);
    cost += take * b.cost;
    remain -= take;
  }
  // Nếu bán nhiều hơn tồn (trường hợp lỗi), tính giá lô cuối
  if (remain > 0 && batches.length > 0) {
    cost += remain * batches[batches.length - 1].cost;
  }
  return cost;
}

// --- API: Lấy giá vốn FIFO cho báo cáo lợi nhuận ---
app.get('/api/fifo-cost', async (req, res) => {
  try {
    const products = await Product.find({}, { name: 1, batches: 1, cost: 1 });
    const result = {};
    for (const p of products) {
      result[p._id.toString()] = {
        batches: p.batches || [],
        currentCost: (p.batches && p.batches.length > 0) ? p.batches[0].cost : (p.cost || 0)
      };
    }
    res.json(result);
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
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, 'sw.js')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo.png')));
app.get('*', (req, res) => {
 res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index-final.html'));
});
// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 LamThanh Server chạy tại http://localhost:${PORT}`);
});
