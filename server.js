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

app.post('/api/returns', async (req, res) => {
  try {
    const s = await getSettings();
    const ret = await Return.create({ ...req.body, id: 'TR' + s.counters.ret++ });
    // Trừ công nợ hoặc tạo phiếu chi trả tiền mặt
    if (req.body.customerId) {
      const c = await Customer.findById(req.body.customerId);
      if (c && req.body.retType !== 'tienmat') {
        c.debt = Math.max(0, (c.debt || 0) - req.body.val);
        await c.save();
      }
    }
    // Ghi phiếu chi
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: req.body.date,
      desc: req.body.retType === 'tienmat' ? 'Trả tiền mặt hàng trả — ' + req.body.cust : 'Trừ công nợ hàng trả — ' + req.body.cust,
      subject: req.body.cust,
      amount: req.body.val,
      method: req.body.retType === 'tienmat' ? 'Tiền mặt' : 'Trừ công nợ'
    });
    // Giảm doanh thu: trừ total trên đơn hàng gốc (nếu có ordDbId)
    // Cả 2 hình thức (tiền mặt & trừ nợ) đều giảm doanh thu
    const retVal = Number(req.body.val) || 0;
    if (req.body.ordDbId) {
      const ord = await Order.findById(req.body.ordDbId);
      if (ord) {
        ord.total = Math.max(0, ord.total - retVal);
        // Nếu trả tiền mặt thì không trừ nợ nhưng vẫn giảm collected
        if (req.body.retType === 'tienmat') {
          ord.collected = Math.max(0, (ord.collected || 0) - retVal);
        }
        await ord.save();
        // Cập nhật debt khách nếu trả tiền mặt (giảm total mua → giảm nợ tương ứng)
        if (req.body.customerId && req.body.retType === 'tienmat') {
          let cust = null;
          try { cust = await Customer.findById(req.body.customerId); } catch(e) {}
          if (cust) {
            cust.total = Math.max(0, (cust.total || 0) - retVal);
            await cust.save();
          }
        }
      }
    } else if (req.body.customerId) {
      // Không có đơn gốc cụ thể → trừ vào đơn delivered gần nhất chưa hoàn
      const orders = await Order.find({ customerId: req.body.customerId, status: 'delivered' }).sort({ createdAt: -1 });
      let rem = retVal;
      for (const ord of orders) {
        if (rem <= 0) break;
        const deduct = Math.min(ord.total, rem);
        ord.total = Math.max(0, ord.total - deduct);
        if (req.body.retType === 'tienmat') ord.collected = Math.max(0, (ord.collected || 0) - deduct);
        await ord.save();
        rem -= deduct;
      }
      if (req.body.retType === 'tienmat') {
        let cust = null;
        try { cust = await Customer.findById(req.body.customerId); } catch(e) {}
        if (cust) { cust.total = Math.max(0, (cust.total || 0) - retVal); await cust.save(); }
      }
    }
    if (req.body.returnItems && req.body.returnItems.length > 0) {
      for (const item of req.body.returnItems) {
        if (item.productId && item.qty > 0) {
          // Hoàn kho + thêm batch FIFO với giá nhập gần nhất
          const prod = await Product.findById(item.productId);
          if (prod) {
            // Lấy giá nhập: từ batch cuối cùng hoặc p.cost
            const lastBatch = prod.batches && prod.batches.length > 0
              ? prod.batches[prod.batches.length - 1]
              : null;
            const returnCost = lastBatch ? lastBatch.cost : (prod.cost || item.price || 0);
            const newBatch = {
              qty: Number(item.qty),
              cost: returnCost,
              date: req.body.date,
              impId: 'TR-' + ret.id  // đánh dấu là hàng trả
            };
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: Number(item.qty) },
              $push: { batches: newBatch }
            });
          }
        }
      }
    }
    // Ghi phiếu chi hoàn tiền
    await Cashflow.create({
      id: 'PC' + s.counters.cash++,
      type: 'Chi',
      date: req.body.date,
      desc: 'Trả hàng đơn #' + req.body.ordId,
      subject: req.body.cust,
      amount: req.body.val,
      method: 'Hoàn trả'
    });
    await s.save();
    res.json(ret);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- PUT/DELETE RETURNS ---
app.put('/api/returns/:id', async (req, res) => {
  try {
    const old = await Return.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Không tìm thấy phiếu trả' });

    // 1. HOÀN NGƯỢC dữ liệu cũ
    // Hoàn ngược tồn kho cũ - trừ stock và xóa batch TR-
    if (old.returnItems && old.returnItems.length > 0) {
      for (const item of old.returnItems) {
        if (item.productId && item.qty > 0) {
          const prod = await Product.findById(item.productId);
          if (prod) {
            const updatedBatches = (prod.batches || []).filter(b => b.impId !== 'TR-' + old.id);
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: -Number(item.qty) },
              $set: { batches: updatedBatches }
            });
          }
        }
      }
    }
    // Hoàn lại công nợ nếu đã trừ
    if (old.customerId && old.retType !== 'tienmat') {
      let cust = null;
      try { cust = await Customer.findById(old.customerId); } catch(e) {}
      if (cust) { cust.debt = (cust.debt || 0) + old.val; await cust.save(); }
    }
    // Xóa phiếu chi cũ liên quan
    await Cashflow.deleteMany({ subject: old.cust, date: old.date, amount: old.val });

    // 2. ÁP DỤNG dữ liệu mới
    const newData = req.body;
    // Cộng tồn kho mới + batch FIFO
    if (newData.returnItems && newData.returnItems.length > 0) {
      for (const item of newData.returnItems) {
        if (item.productId && item.qty > 0) {
          const prod = await Product.findById(item.productId);
          if (prod) {
            const lastBatch = prod.batches && prod.batches.length > 0
              ? prod.batches[prod.batches.length - 1] : null;
            const returnCost = lastBatch ? lastBatch.cost : (prod.cost || item.price || 0);
            const newBatch = { qty: Number(item.qty), cost: returnCost, date: newData.date, impId: 'TR-' + req.params.id };
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: Number(item.qty) },
              $push: { batches: newBatch }
            });
          }
        }
      }
    }
    // Trừ công nợ mới
    if (newData.customerId && newData.retType !== 'tienmat') {
      let cust = null;
      try { cust = await Customer.findById(newData.customerId); } catch(e) {}
      if (!cust) cust = await Customer.findOne({ id: newData.customerId });
      if (cust) { cust.debt = Math.max(0, (cust.debt || 0) - newData.val); await cust.save(); }
    }
    // Tạo phiếu chi mới
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

    // 3. Cập nhật phiếu trả
    const updated = await Return.findByIdAndUpdate(req.params.id, newData, { new: true });
    res.json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/returns/:id', async (req, res) => {
  try {
    const ret = await Return.findById(req.params.id);
    if (!ret) return res.status(404).json({ error: 'Không tìm thấy phiếu trả' });
    // Hoàn lại tồn kho - trừ stock và xóa batch TR-
    if (ret.returnItems && ret.returnItems.length > 0) {
      for (const item of ret.returnItems) {
        if (item.productId && item.qty > 0) {
          const prod = await Product.findById(item.productId);
          if (prod) {
            const updatedBatches = (prod.batches || []).filter(b => b.impId !== 'TR-' + ret.id);
            await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -Number(item.qty) }, $set: { batches: updatedBatches } });
          }
        }
      }
    }
    // Hoàn lại công nợ (nếu đã trừ công nợ)
    if (ret.customerId && ret.retType !== 'tienmat') {
      let cust = null;
      try { cust = await Customer.findById(ret.customerId); } catch(e) {}
      if (cust) { cust.debt = (cust.debt || 0) + ret.val; await cust.save(); }
    }
    // Hoàn ngược doanh thu khi xóa phiếu trả
    const retVal = Number(ret.val) || 0;
    if (ret.ordDbId) {
      const ord = await Order.findById(ret.ordDbId);
      if (ord) {
        ord.total = (ord.total || 0) + retVal;
        if (ret.retType === 'tienmat') ord.collected = (ord.collected || 0) + retVal;
        await ord.save();
      }
    }
    if (ret.customerId && ret.retType === 'tienmat') {
      let custR = null;
      try { custR = await Customer.findById(ret.customerId); } catch(e) {}
      if (custR) { custR.total = (custR.total || 0) + retVal; await custR.save(); }
    }
    // Xóa phiếu chi liên quan
    await Cashflow.deleteMany({ desc: { $regex: ret.cust }, date: ret.date, amount: ret.val });
    await Return.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
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
    // Tìm theo _id hoặc id (mã KH)
    let cust = null;
    try { cust = await Customer.findById(req.body.custDbId); } catch(e) {}
    if (!cust) cust = await Customer.findOne({ id: req.body.custDbId });
    if (!cust) return res.status(404).json({ error: 'Không tìm thấy khách hàng: ' + req.body.custDbId });
    // Tính debt thực từ orders (tổng đơn - đã thu)
    const custOrders = await Order.find({ customerId: req.body.custDbId, status: 'delivered' });
    const totalOrdered = custOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalCollected = custOrders.reduce((s, o) => s + (o.collected || 0), 0);
    const realDebt = Math.max(0, totalOrdered - totalCollected);
    const actual = Math.min(Number(req.body.amount) || 0, realDebt > 0 ? realDebt : (cust.debt || 0));
    if (actual <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ hoặc khách không có nợ (nợ thực: ' + realDebt + ')' });
    // Cập nhật debt trên customer
    cust.debt = Math.max(0, (cust.debt || realDebt) - actual);
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

// --- SYNC ALL: Tính lại collected + debt từ collections thực tế ---
app.post('/api/sync-all', async (req, res) => {
  try {
    // 0. Xóa collections rác (amount = 0)
    await Collection.deleteMany({ amount: { $lte: 0 } });
    // 1. Reset collected về 0 cho tất cả orders
    await Order.updateMany({}, { $set: { collected: 0 } });

    // 2. Tính lại collected từ collections thực tế
    const collections = await Collection.find();
    for (const col of collections) {
      const custId = col.custId;
      // Tìm các đơn của khách, cộng collected theo thứ tự cũ nhất
      const orders = await Order.find({
        customerId: { $in: [custId] },
        status: 'delivered'
      }).sort({ createdAt: 1 });
      let rem = col.amount;
      for (const o of orders) {
        if (rem <= 0) break;
        const due = o.total - (o.collected || 0);
        if (due <= 0) continue;
        const take = Math.min(due, rem);
        o.collected = (o.collected || 0) + take;
        await o.save();
        rem -= take;
      }
    }

    // 3. Tính lại debt cho tất cả khách
    const customers = await Customer.find();
    let updated = 0;
    for (const c of customers) {
      const cid = c._id.toString();
      const orders = await Order.find({ customerId: { $in: [cid, c.id] }, status: 'delivered' });
      const totalOrdered = orders.reduce((s, o) => s + (o.total || 0), 0);
      const totalCollected = orders.reduce((s, o) => s + (o.collected || 0), 0);
      const realDebt = Math.max(0, totalOrdered - totalCollected);
      c.debt = realDebt;
      c.total = totalOrdered;
      await c.save();
      updated++;
    }
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- SYNC DEBT: Tính lại debt cho tất cả khách từ orders ---
app.post('/api/sync-debt', async (req, res) => {
  try {
    const customers = await Customer.find();
    let count = 0;
    for (const c of customers) {
      const cid = c._id.toString();
      const orders = await Order.find({ customerId: { $in: [cid, c.id] }, status: 'delivered' });
      const totalOrdered = orders.reduce((s, o) => s + (o.total || 0), 0);
      const totalCollected = orders.reduce((s, o) => s + (o.collected || 0), 0);
      const realDebt = Math.max(0, totalOrdered - totalCollected);
      if (c.debt !== realDebt || c.total !== totalOrdered) {
        c.debt = realDebt;
        c.total = totalOrdered;
        await c.save();
        count++;
      }
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
