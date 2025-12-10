import express from 'express';
import cors from 'cors';
import sql from 'mssql';
// const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración SQL Server
const dbConfig = {
  user: 'sa',
  password: '111',
  server: '192.168.1.124', // IP del servidor SQL
  database: 'girosoft',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Conexión
sql.connect(dbConfig)
  .then(() => console.log('✅ Conectado a SQL Server'))
  .catch(err => console.error('❌ Error de conexión SQL:', err));


// ===================================================================================================
// -------------------------------------- CRUD de usuarios -------------------------------------------
// ===================================================================================================
app.post('/api/login', async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ message: "Faltan datos" });
  }

  try {
    const request = new sql.Request();
    request.input("correo", sql.VarChar, correo);
    request.input("contrasena", sql.VarChar, contrasena);

    const result = await request.query(`
      SELECT usr_id, usr_correo, usr_nombre
      FROM usuarios
      WHERE usr_correo = @correo
      AND usr_contrasena = @contrasena
    `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
    }

    const user = result.recordset[0];

    return res.json({
      message: "Login correcto",
      user: {
        id: user.usr_id,
        correo: user.usr_correo,
        nombre: user.usr_nombre
      }
    });

  } catch (err) {
    res.status(500).send(err.message);
  }
});


// CRUD básico de usuarios
/*app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM Usuarios`;
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/usuarios', async (req, res) => {
  const { nombre, email } = req.body;
  try {
    await sql.query`INSERT INTO Usuarios (nombre, email) VALUES (${nombre}, ${email})`;
    res.send('Usuario agregado');
  } catch (err) {
    res.status(500).send(err.message);
  }
});*/


// ===================================================================================================
// -------------------------------------- CRUD del almacen -------------------------------------------
// ===================================================================================================

// ****************** Consultas de catálogos (para obtener los desplegables) *************************
// Obtener materiales
app.get('/api/materiales', async (req, res) => {
  try {
    const result = await sql.query(`SELECT mat_id, mat_nombre FROM material ORDER BY mat_nombre;`);
    res.json(result.recordset);
  } catch (err) { res.status(500).send(err.message); }
});

// Obtener empresas desde la tabla de proveedores
app.get('/api/proveedores', async (req, res) => {
  try {
    const result = await sql.query(`SELECT DISTINCT prov_empresa FROM proveedor ORDER BY prov_empresa;`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Obtener el nombre de los proveedores que trabajan en la misma empresa
app.get('/api/proveedores/:empresa/personas', async (req, res) => {
  const { empresa } = req.params;

  try {
    const request = new sql.Request();
    request.input('empresa', sql.VarChar, empresa);

    const result = await request.query(`
      SELECT prov_id, prov_nombre
      FROM proveedor
      WHERE prov_empresa = @empresa
      ORDER BY prov_nombre;
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error en consulta proveedores por empresa:", err);
    res.status(500).send(err.message);
  }
});


// Obtener lista de encargados (solo es uno pero, ajá)
app.get('/api/encargados', async (req, res) => {
  try {
    const result = await sql.query(`SELECT enc_id, enc_nombre FROM encargado ORDER BY enc_nombre;`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// ****************************** Consultas para obtener las tablas ************************************
// Obtener todos los registros
app.get('/api/registro', async(req,res) => {
  try {
    const result = await sql.query(`SELECT r.reg_id, m.mat_nombre, r.reg_cantidad, r.reg_fecha,
                                            p.prov_empresa, p.prov_nombre, e.enc_nombre
                                    FROM registro r
                                    LEFT JOIN material m ON r.reg_mat_id = m.mat_id
                                    LEFT JOIN proveedor p ON r.reg_prov_id = p.prov_id
                                    LEFT JOIN encargado e ON r.reg_enc_id = e.enc_id
                                    ORDER BY r.reg_fecha DESC;`);

    res.json(result.recordset);
  } catch (err){
    res.status(500).send(err.message);
  }
});

// Obtener inventario (stock del almacén)
app.get('/api/inventario', async (req, res) => {
  try {
    const result = await sql.query(`SELECT i.inv_id, m.mat_nombre, m.mat_tipo, i.inv_cantidad
                                    FROM inventario i
                                    INNER JOIN material m ON i.inv_mat_id = m.mat_id
                                    ORDER BY m.mat_nombre;`);
    res.json(result.recordset);
  } catch (err){
    res.status(500).send(err.message);
  }
});


// ****************************** Inserciones y modificaciones ******************************************
// Agregar registro (entrada de material al almacén)
app.post('/api/registro', async (req, res) => {
  const { mat_id, prov_id, cantidad, fecha, enc_id } = req.body;

  if(!mat_id || !prov_id || !cantidad || !fecha || !enc_id)
    return res.status(400).send("Faltan datos");

  try {
    // 1. Insertar registro
    await sql.query(`INSERT INTO registro (reg_mat_id, reg_prov_id, reg_cantidad, reg_fecha, reg_enc_id)
                    VALUES(${mat_id}, ${prov_id}, ${cantidad}, '${fecha}', ${enc_id})`);

    // 2. Actualizar stock
    await sql.query(`UPDATE inventario 
                      SET inv_cantidad = inv_cantidad + ${cantidad}
                      WHERE inv_mat_id = ${mat_id}`);

    res.json({message: "Registro agregado y stock actualizado"});
    // res.send("Registro agregado y stock actualizado");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// CREATE --> post
// READ --> get
// UPDATE --> put
// DELETE --> delete

// Modificar inventario (stock)
app.put('/api/inventario/:id', async (req, res) => {
  const { id } = req.params;
  const { cantidad } = req.body;

  try {
    await sql.query(`UPDATE inventario
                      SET inv_cantidad = ${cantidad}
                      WHERE inv_id = ${id}`);

    res.json({message: "Stock actualizado"});                 
    // res.send("Stock actualizado");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Eliminar stock
app.delete('/api/inventario/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await sql.query(`DELETE FROM inventario WHERE inv_id = ${id}`);
    res.json({message: "Stock eliminado"});
    // res.send("Stock eliminado");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Obtener los últimos 3 registros insertados
app.get('/api/registro/ultimos', async (req, res) => {
  try {
    const result = await sql.query(`SELECT TOP 3 r.reg_id, r.reg_cantidad, r.reg_fecha,
                                              m.mat_nombre, p.prov_empresa, p.prov_nombre, e.enc_nombre
                                    FROM registro r
                                    INNER JOIN material m ON r.reg_mat_id = m.mat_id
                                    INNER JOIN proveedor p ON r.reg_prov_id = p.prov_id
                                    INNER JOIN encargado e ON r.reg_enc_id = e.enc_id
                                    ORDER BY r.reg_id DESC;`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Editar registro
app.put('/api/registro/:id', async (req, res) => {
  const { id } = req.params;
  const { cantidad } = req.body;

  try {

    // 1. Obtener la cantidad original
    const result = await sql.query(`SELECT reg_cantidad, reg_mat_id
                                    FROM registro
                                    WHERE reg_id = ${id}`);

    if(result.recordset.length === 0){
      return res.status(400).send("Registro no encontrado");
    }

    const cantidadOriginal = result.recordset[0].reg_cantidad;
    const mat_id = result.recordset[0].reg_mat_id;

    // 2. Calcular diferencia
    const diferencia = cantidad - cantidadOriginal;

    // 3. Actualizar inventario
    await sql.query(`UPDATE inventario
                      SET inv_cantidad = inv_cantidad + ${diferencia}
                      WHERE inv_mat_id = ${mat_id}`);

    // 4. Actualizar registro
    await sql.query(`UPDATE registro
                      SET reg_cantidad = ${cantidad}
                      WHERE reg_id = ${id}
    `);

    res.json({message: "Registro actualizado correctamente"});
    // res.send("Registro actualizado correctamente");

  } catch (err) {
    console.error("Error al actualizar registro:", err);
    res.status(500).send(err.message);
  }
});


// Eliminar un registro
app.delete('/api/registro/:id', async (req, res) => {
  const { id } = req.params;

  try{
    // 1. Obtener datos
    const datos = await sql.query(`
      SELECT reg_mat_id, reg_cantidad 
      FROM registro 
      WHERE reg_id = ${id}
    `);

    if (datos.recordset.length === 0)
      return res.status(404).send("Registro no encontrado");

    const mat_id = datos.recordset[0].reg_mat_id;
    const cantidad = datos.recordset[0].reg_cantidad;

    // 2. Actualizar inventario
    await sql.query(`
      UPDATE inventario
      SET inv_cantidad = inv_cantidad - ${cantidad}
      WHERE inv_mat_id = ${mat_id}
    `);

    // 3. Eliminar el registro
    await sql.query(`
      DELETE FROM registro WHERE reg_id = ${id}
    `);

    res.json({message: "Registro eliminado y stock actualizado"});
    // res.send("Registro eliminado y stock actualizado");

  } catch (err) {
    res.status(500).send(err.message);
  }//
});


// apii de pdf
// app.get('/descargar-pdf', (req, res) => {
//     const filePath = path.join(__dirname, 'documento.pdf');

//     res.download(filePath, 'mi-archivo.pdf', (err) => {
//         if (err) {
//             console.log("Error al enviar PDF", err);
//         }
//     });
// });
app.listen(3000, () => console.log('🚀 Servidor Express corriendo en http://localhost:3000'));
