const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const PDFDocument = require('pdfkit');


const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'mi_clave_super_secreta_para_el_carrito', 
    resave: false,
    saveUninitialized: true,
  })
);

app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = []; 
  }
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = req.session.cart
    ? req.session.cart.reduce((sum, item) => sum + item.cantidad, 0)
    : 0;
  next();
});

function calcularTotal(cart) {
  return cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).send('Debes iniciar sesión para acceder a esta sección.');
  }
  next();
}


app.get('/', (req, res) => {
  res.redirect('/productos');
});

app.get('/productos', (req, res) => {
  const { loginError, registroError } = req.query; 
  const sql = 'SELECT * FROM productos';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener productos:', err);
      return res.status(500).send('Error al obtener productos');
    }

    res.render('productos', {
      productos: results,
      loginError,
      registroError,
    });
  });
});



app.post('/carrito/agregar', (req, res) => {
  const { productoId } = req.body;

  if (!productoId) {
    return res.redirect('/productos');
  }

  const sql = 'SELECT * FROM productos WHERE id = ?';
  db.query(sql, [productoId], (err, results) => {
    if (err) {
      console.error('Error al buscar producto:', err);
      return res.status(500).send('Error al agregar al carrito');
    }

    if (results.length === 0) {
      return res.redirect('/productos');
    }

    const producto = results[0];
    const cart = req.session.cart;
    const existing = cart.find((item) => item.producto_id === producto.id);

    if (existing) {
      existing.cantidad += 1;
    } else {
      cart.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        cantidad: 1,
      });
    }

    req.session.cart = cart;
    res.redirect('/productos');
  });
});

app.get('/carrito', (req, res) => {
  const cart = req.session.cart;
  const total = calcularTotal(cart);

  res.render('carrito', {
    cart,
    total,
  });
});

app.post('/carrito/actualizar', (req, res) => {
  const { productoId, cantidad } = req.body;
  const qty = parseInt(cantidad, 10);

  if (!productoId || isNaN(qty) || qty < 1) {
    return res.redirect('/carrito');
  }

  const cart = req.session.cart;
  const item = cart.find((i) => i.producto_id == productoId);

  if (item) {
    item.cantidad = qty;
  }

  req.session.cart = cart;
  res.redirect('/carrito');
});

app.post('/carrito/eliminar', (req, res) => {
  const { productoId } = req.body;

  if (!productoId) {
    return res.redirect('/carrito');
  }

  const cart = req.session.cart;
  const nuevoCarrito = cart.filter((i) => i.producto_id != productoId);

  req.session.cart = nuevoCarrito;
  res.redirect('/carrito');
});


app.post('/registro', (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.redirect('/productos?registroError=Completa todos los campos.');
  }

  const checkSql = 'SELECT * FROM usuarios WHERE email = ?';
  db.query(checkSql, [email], (err, results) => {
    if (err) {
      console.error('Error al verificar usuario:', err);
      return res.redirect('/productos?registroError=Error en el servidor.');
    }

    if (results.length > 0) {
      return res.redirect('/productos?registroError=El correo ya está registrado.');
    }

    const insertSql = 'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)';
    db.query(insertSql, [nombre, email, password], (err2, result) => {
      if (err2) {
        console.error('Error al crear usuario:', err2);
        return res.redirect('/productos?registroError=No se pudo registrar.');
      }

      req.session.user = {
        id: result.insertId,
        nombre,
        email,
      };

      res.redirect('/productos');
    });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.redirect('/productos?loginError=Completa todos los campos.');
  }

  const sql = 'SELECT * FROM usuarios WHERE email = ?';
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('Error al buscar usuario:', err);
      return res.redirect('/productos?loginError=Error en el servidor.');
    }

    if (results.length === 0) {
      return res.redirect('/productos?loginError=Correo o contraseña incorrectos.');
    }

    const user = results[0];

    if (user.password !== password) {
      return res.redirect('/productos?loginError=Correo o contraseña incorrectos.');
    }

    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
    };

    res.redirect('/productos');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/productos');
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});


app.get('/checkout', requireLogin, (req, res) => {
  const cart = req.session.cart || [];

  if (!cart.length) {
    return res.redirect('/carrito');
  }

  const total = calcularTotal(cart);

  res.render('checkout', {
    cart,
    total,
  });
});

app.post('/checkout', requireLogin, (req, res) => {
  const cart = req.session.cart || [];

  if (!cart.length) {
    return res.redirect('/carrito');
  }

  const total = calcularTotal(cart);
  const userId = req.session.user.id;

  // Primero verificar que hay suficiente stock
  const checkStockPromises = cart.map(item => {
    return new Promise((resolve, reject) => {
      const checkSql = 'SELECT stock FROM productos WHERE id = ?';
      db.query(checkSql, [item.producto_id], (err, results) => {
        if (err) {
          reject(err);
        } else if (results.length === 0) {
          reject(new Error(`Producto ${item.producto_id} no encontrado`));
        } else if (results[0].stock < item.cantidad) {
          reject(new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${results[0].stock}`));
        } else {
          resolve();
        }
      });
    });
  });

  Promise.all(checkStockPromises)
    .then(() => {
      // Si hay stock suficiente, crear la orden
      const insertOrdenSql = 'INSERT INTO ordenes (usuario_id, total) VALUES (?, ?)';

      db.query(insertOrdenSql, [userId, total], (err, result) => {
        if (err) {
          console.error('Error al crear orden:', err);
          return res.status(500).send('Error al crear la orden.');
        }

        const ordenId = result.insertId;
        console.log(`✅ Orden creada con ID: ${ordenId}`);

        // Actualizar stock de todos los productos PRIMERO
        let stocksActualizados = 0;
        const updateStockSql = 'UPDATE productos SET stock = stock - ? WHERE id = ?';

        cart.forEach(item => {
          db.query(updateStockSql, [item.cantidad, item.producto_id], (err3, result3) => {
            if (err3) {
              console.error('❌ Error al actualizar stock:', err3);
            } else {
              console.log(`✅ Stock actualizado - Producto ID: ${item.producto_id}, Cantidad restada: ${item.cantidad}`);
              console.log(`   Filas afectadas: ${result3.affectedRows}`);
            }
            
            stocksActualizados++;
            
            // Cuando terminemos de actualizar todos los stocks, insertamos los detalles
            if (stocksActualizados === cart.length) {
              insertarDetallesOrden();
            }
          });
        });

        // Función para insertar los detalles después de actualizar stock
        function insertarDetallesOrden() {
          const insertDetalleSql = `
            INSERT INTO orden_detalle (orden_id, producto_id, cantidad, precio_unitario, subtotal)
            VALUES (?, ?, ?, ?, ?)
          `;

          let detallesInsertados = 0;

          cart.forEach(item => {
            const subtotal = item.precio * item.cantidad;
            
            db.query(
              insertDetalleSql,
              [ordenId, item.producto_id, item.cantidad, item.precio, subtotal],
              (err2) => {
                if (err2) {
                  console.error('❌ Error al insertar detalle:', err2);
                } else {
                  console.log(`✅ Detalle insertado para producto ${item.producto_id}`);
                }

                detallesInsertados++;
                
                // Cuando terminemos con todos los detalles, limpiamos carrito y redirigimos
                if (detallesInsertados === cart.length) {
                  console.log('✅ Compra completada exitosamente');
                  req.session.cart = [];
                  res.redirect(`/historial?ordenExitosa=1`);
                }
              }
            );
          });
        }
      });
    })
    .catch(error => {
      console.error('❌ Error de stock:', error);
      return res.status(400).send(error.message);
    });
});

app.get('/historial', requireLogin, (req, res) => {
  const userId = req.session.user.id;
  const { ordenExitosa } = req.query;

  const ordenesSql = `
    SELECT id, total, fecha_orden
    FROM ordenes
    WHERE usuario_id = ?
    ORDER BY fecha_orden DESC
  `;

  db.query(ordenesSql, [userId], (err, ordenes) => {
    if (err) {
      console.error('Error al obtener órdenes:', err);
      return res.status(500).send('Error al obtener historial.');
    }

    if (!ordenes.length) {
      return res.render('historial', {
        ordenes: [],
        detallesPorOrden: {},
        ordenExitosa,
      });
    }

    const ordenIds = ordenes.map(o => o.id);

    const detalleSql = `
      SELECT od.orden_id, od.producto_id, od.cantidad, od.precio_unitario, od.subtotal,
             p.nombre AS producto_nombre
      FROM orden_detalle od
      JOIN productos p ON p.id = od.producto_id
      WHERE od.orden_id IN (?)
    `;

    db.query(detalleSql, [ordenIds], (err2, detalles) => {
      if (err2) {
        console.error('Error al obtener detalles:', err2);
        return res.status(500).send('Error al obtener historial.');
      }

      const detallesPorOrden = {};
      for (const d of detalles) {
        if (!detallesPorOrden[d.orden_id]) {
          detallesPorOrden[d.orden_id] = [];
        }
        detallesPorOrden[d.orden_id].push(d);
      }

      res.render('historial', {
        ordenes,
        detallesPorOrden,
        ordenExitosa,
      });
    });
  });
});

app.get('/ticket/:ordenId', requireLogin, (req, res) => {
  const userId = req.session.user.id;
  const ordenId = req.params.ordenId;

  const ordenSql = `
    SELECT id, usuario_id, total, fecha_orden
    FROM ordenes
    WHERE id = ? AND usuario_id = ?
  `;

  db.query(ordenSql, [ordenId, userId], (err, ordenes) => {
    if (err) {
      console.error('Error al obtener la orden:', err);
      return res.status(500).send('Error al generar el ticket.');
    }

    if (!ordenes.length) {
      return res.status(404).send('Orden no encontrada.');
    }

    const orden = ordenes[0];
    const totalNumero = Number(orden.total || 0);

    const detalleSql = `
      SELECT od.producto_id, od.cantidad, od.precio_unitario, od.subtotal,
             p.nombre AS producto_nombre
      FROM orden_detalle od
      JOIN productos p ON p.id = od.producto_id
      WHERE od.orden_id = ?
    `;

    db.query(detalleSql, [ordenId], (err2, detalles) => {
      if (err2) {
        console.error('Error al obtener detalles del ticket:', err2);
        return res.status(500).send('Error al generar el ticket.');
      }

      const doc = new PDFDocument({ margin: 50 });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="ticket_orden_${ordenId}.pdf"`
      );

      doc.pipe(res);

      doc.fontSize(18).text('Ticket de compra', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12);
      doc.text(`Orden #: ${orden.id}`);
      doc.text(`Cliente: ${req.session.user.nombre} (${req.session.user.email})`);

      let fechaMostrada = orden.fecha_orden;
      if (fechaMostrada instanceof Date) {
        fechaMostrada = fechaMostrada.toISOString().slice(0, 19).replace('T', ' ');
      }
      doc.text(`Fecha: ${fechaMostrada}`);
      doc.moveDown();

      doc.text('Detalle de productos:');
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold');
      doc.text('Producto', 50, doc.y, { continued: true });
      doc.text('Cant.', 300, doc.y, { width: 50, continued: true, align: 'right' });
      doc.text('P. Unitario', 360, doc.y, { width: 90, continued: true, align: 'right' });
      doc.text('Subtotal', 460, doc.y, { width: 90, align: 'right' });

      doc.moveDown(0.5);
      doc.font('Helvetica');

      detalles.forEach(det => {
        const precioUnit = Number(det.precio_unitario || 0);
        const subtotal = Number(det.subtotal || 0);

        doc.text(det.producto_nombre, 50, doc.y, { continued: true });
        doc.text(det.cantidad.toString(), 300, doc.y, { width: 50, continued: true, align: 'right' });
        doc.text(`$${precioUnit.toFixed(2)}`, 360, doc.y, { width: 90, continued: true, align: 'right' });
        doc.text(`$${subtotal.toFixed(2)}`, 460, doc.y, { width: 90, align: 'right' });
      });

      doc.moveDown(1.5);

      doc.font('Helvetica-Bold');
      doc.text(`Total: $${totalNumero.toFixed(2)}`, { align: 'right' });

      doc.moveDown(2);
      doc.font('Helvetica');
      doc.text('Gracias por tu compra.', { align: 'center' });

      doc.end();
    });
  });
});