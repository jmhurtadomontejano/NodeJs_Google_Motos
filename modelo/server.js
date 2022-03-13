const express = require("express");
require("dotenv").config();
const { dbConnection } = require("../database/config");
const Usuario = require("./usuario");
const Producto = require("./producto");
const Rol = require("./rol");
const Moto = require("./Moto");
const bcryptjs = require("bcryptjs");
const { body, validationResult, check } = require("express-validator");
const { generarJWT } = require("../helpers/generarJWT");
const { validarJWT } = require("../middleware/validar-JWT");
const { OAuth2Client } = require("google-auth-library");
const fileUpload = require("express-fileupload");
const cookie_parse = require("cookie-parser");

//cifrar nombre archivo para que sea unico, punto 7.2 de Base NodeJS
const { v4: uuidv4 } = require("uuid"); //lo renombramos a uuidv4

const port = process.env.PORT;
class Server {
  constructor() {
    this.app = express();
    this.conectarDB();
    this.middlewares();
    this.rutas();
  }
  middlewares() {
    /*FILTRAN LA SOLICITUD; HACEN ALGO Y DEVULEVEN RESPUESTAS */
    this.app.use(express.json()); //Middleware para leer json;
    this.app.use(express.static("public"));    //^Middleware para servir la carpeta public
    this.app.use(cookie_parse());    //^Middleware para servir la carpeta public

    /*Middleware para cargar una imagen a un archivoTemporal */
    this.app.use(
      fileUpload({
        useTempFiles: true,
        tempFileDir: "/tmp/",
      }));
  }
  async conectarDB() {
    await dbConnection();
  }
  rutas() {
    /*RUTAS PARA SUBIR ARCHIVOS POR POST */
    this.app.post("/subir", async function (req, res) {
      if (!req.files) {
        res.status(400).json({
          msg: "NO se han mandado archivos",
        });
      }
      //Esperamos un archivo con el nombre de "archivo"
      if (!req.files) {
        res.status(400).json({
          msg: "NO se ha mandado 'archivo'",
        });
      } else {
        //SI SE HA ENVIADO EL ARCHIVO
        res.json({
          msg: req.files,
        });
        const archivo = req.files.archivo;
        //*nombreCortado será un array de trozos separados(split) por puntos punto 7.1 Jose Luis
        const nombreCortado = archivo.name.split(".");
        //*En la siguiente variable guardo el ultimo trozo del array nombreCortado punto 7.1 Jose Luis
        const extension = nombreCortado[nombreCortado.length - 1];

        //Validar la extensión punto 7.1 Jose Luis
        const extensionesValidas = ["jpg", "png", "jpeg", "gif"];
        if (!extensionesValidas.includes(extension)) {
          return res.status(400).json({
            msg: `La extensión ${extension} no está permitida, solo se permiten: ${extensionesValidas}`,
          });
        }

        const nombreTemp = uuidv4() + "." + extension;
        const path = require("path"); //esto es de nodejs

        const uploadPath = path.join(
          __dirname,
          "../public/imagenes/",
          nombreTemp
        );
        archivo.mv(uploadPath, function (err) {
          if (err) {
            return res.status(500).json(err);
          }
          res.status(200).json({
            msg: "Archivo subido con éxito",
            nombreTemporal,
          });
        });
      }
    });

    /******* RUTAS DE google *****/
    this.app.post(
      "/google",
      check("id_token", "El token es necesario").not().isEmpty(),
      async function (req, res) {
        const { id_token } = req.body;
        const erroresVal = validationResult(req);
        //comprueba si ha habido errores en los checks
        if (!erroresVal.isEmpty()) {
          return res.status(400).json({ msg: erroresVal.array() });
        }
        //try {
          //******** COMPRUEBO EL TOKEN *************/
          const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

          const ticket = await client.verifyIdToken({
            idToken: id_token,
            audience: process.env.GOOGLE_CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
            // Or, if multiple clients access the backend:
            //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
          });
          const payload = ticket.getPayload();
          console.log("PAYLOAD", payload);
          /*Recupero los parametros de la cuenta de Google en Español */
          const correo = payload.email;
          const img = payload.picture;
          const nombre = payload.name;
          let miusuario = await Usuario.findOne({ correo });

          if (!miusuario) {
            /*Si no encuentra ningun usuario con ese correo lo crea */
            let data = {
              nombre,
              correo,
              password: "123456",
              img,
              google: true,
              rol: "USER_ROLE",
            };
            console.log("USUARIO A CREAR", data);
            miusuario = new Usuario(data);
            await miusuario.save();
            console.log("USUARIO A CREADO", miusuario);
          }
          // If request specified a G Suite domain:
          // const domain = payload['hd'];

          /*GENERO UN TOKEN VALIDO */
          const tokenGenerado = await generarJWT(miusuario.id);
          const id = miusuario.id;

          //******** ENVÍO UN RESPUESTA */
          res
          .cookie("access_token",tokenGenerado,{
            httpOnly: true,
            secure: true
          })
          .json({
            msg: "Todo bien con Google",
            id_token,
            token: tokenGenerado,
            miusuario,
          });
        // } catch (error) {
        //   //******** ENVÍO UN RESPUESTA */
        //   res.json({
        //     msg: "TODO MAL con Google. ERROR DE VERIFICACION",

        //   });
        // }
        //  
      }
    );

    /******* RUTAS DEL LOGIN *****/
    this.app.post(
      "/login",
      check("correo", "El correo no es válido").isEmail(),
      check("password", "La contraseña no puede ser vacía").not().isEmpty(),
      async function (req, res) {
        const erroresVal = validationResult(req);
        //comprueba si ha habido errores en los checks
        if (!erroresVal.isEmpty()) {
          return res.status(400).json({ msg: erroresVal.array() });
        }
        const { correo, password } = req.body;
        try {
          //verifico si el correo existe en la BD
          const miusuario = await Usuario.findOne({ correo });
          if (!miusuario) {
            res.status(400).json({
              msg: "El correo no existe",
              correo,
            });
          } else {
            //verifico la contraseña
            const validPassword = bcryptjs.compareSync(
              password,
              miusuario.password
            );
            if (!validPassword) {
              res.status(400).json({
                msg: "El password no es correcto",
              });
            } else {
              //genero el TOKEN JWT propio
              const token = await generarJWT(miusuario.id);
              const id = miusuario.id;
              res
              .cookie("access_token",token,{
                httpOnly: true,
                secure: true
              })
              .json({
                msg: "Login OK",
                token,
                id,
              });
            }
          }
        } catch (error) {
          console.log(error);
          res.status(500).json({
            msg: "Error de autenticación",
          });
        }
      }
    );

    this.app.get("/logout", async function (req, res) {
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      //await OAuth2Client.revokeCredentials;
      res.clearCookie("access_token").json({msg: "done"});

    })

    /******* RUTAS DEL PRODUCTO *****/
    this.app.get(
      "/webresources/generic/productos/:id",

      async function (req, res) {
        const id = req.params.id;
        let producto = await Producto.findById(id);
        res.json(producto);
      }
    );
    this.app.get("/webresources/generic/productos", async function (req, res) {
      let productos = await Producto.find();
      res.json(
        productos
        //[{"categoria":"chucherias","id":30,"imagen":"chuches.jpg","nombre":"chupa chus de naranja","precio":0.0},{"categoria":"chucherias","id":31,"imagen":"chuches.jpg","nombre":"chicle de melón","precio":0.0},{"categoria":"postres","id":33,"imagen":"melon.jpg","nombre":"Melon de chino","precio":2.0},{"categoria":"postres","id":34,"imagen":"melon.jpg","nombre":"Melon de sapo","precio":2.0},{"categoria":"bebidas","id":35,"imagen":"burger/fanta.png","nombre":"Coca cola de melón","precio":3.0},{"categoria":"refrescos","id":38,"imagen":"sandia.jpg","nombre":"refresco de kiwi","precio":2.0},{"categoria":"bocadillos","id":39,"imagen":"cod-1659603340642614231-bocadillo.jfif","nombre":"Bocadillo de calamares","precio":5.0},{"categoria":"bebidas","id":40,"imagen":"cod-737444841162795513-bocata2.jpg","nombre":"cerveza","precio":2.0}]
      );
    });
    this.app.post(
      "/webresources/generic/productos",
      validarJWT,
      function (req, res) {
        const body = req.body;
        let miProducto = new Producto(body);
        miProducto.save();
        res.json({
          ok: true,
          msg: "post API productos",
          miProducto,
        });
      }
    );
    //put-productos
    this.app.put(
      "/webresources/generic/productos/:id",
      validarJWT,
      async function (req, res) {
        const body = req.body;
        const id = req.params.id;
        await Producto.findByIdAndUpdate(id, body);
        res.json({
          ok: true,
          msg: "post API productos",
          body,
        });
      }
    );
    //delete PRODUCTOS
    this.app.delete(
      "/webresources/generic/productos/:id",
      validarJWT,
      async function (req, res) {
        const id = req.params.id;
        await Producto.findByIdAndDelete(id);
        res.status(200).json({
          ok: true,
          msg: "delete API",
        });
      }
    );

    /******* RUTAS DE LAS MOTOS *****/
    this.app.get("/webresources/generic/motos/:id", async function (req, res) {
        const id = req.params.id;
        let moto = await Moto.findById(id);
        res.json(moto);
      }
    );
    this.app.get("/webresources/generic/motos",validarJWT, async function (req, res) {
      let motos = await Moto.find();
      res.json(
        motos
        //[{"marca":"honda","modelo":"CBR-2500","cilindrada":"2500","precio":3999, "imagen":"/public/imagenes/13_CBR250R_Repsol.jpg"},
      );
    });

  /*  this.app.post("/webresources/generic/motos", function (req, res) {
      const body = req.body;
      let miMoto = new Moto(body);
      miMoto.save();
      res.json({
        ok: true,
        msg: "post API Moto",
        miMoto,
      });
    });
    */
    
       this.app.post("/webresources/generic/motos", validarJWT, function (req, res) { 
       const archivo = req.files.imagen;
          //*nombreCortado será un array de trozos separados(split) por puntos punto 7.1 Jose Luis
          const nombreCortado = archivo.name.split(".");
          //*En la siguiente variable guardo el ultimo trozo del array nombreCortado punto 7.1 Jose Luis 
          const extension = nombreCortado[nombreCortado.length - 1];

          //Validar la extensión punto 7.1 Jose Luis
          const extensionesValidas = ['jpg','png','jpeg','gif'];
          if(!extensionesValidas.includes(extension)){
            return res.status(400).json({
              msg: `La extensión ${extension} no está permitida, solo se permiten: ${extensionesValidas}`
            })
          }


          const nombreTemp = uuidv4() + "." + extension;
          const path = require("path"); //esto es de nodejs
         
          const uploadPath = path.join(__dirname, "../public/imagenes/", nombreTemp);
          archivo.mv(uploadPath, function (err){
            if (err) return res.status(500).json(err);
            
          });
        const body = req.body;
        let moto = {
          marca: body.marca,
          modelo: body.modelo,
          cilindrada: body.cilindrada,
          precio: 0,
          imagen: uploadPath,
        }
       let miMoto = new Moto(moto);
         miMoto.save();
        res.json({
          ok: true,
          msg: "post API motos",
        });
      });

    //put-motos
    this.app.put("/webresources/generic/motos/:id", async function (req, res) {
      const body = req.body;
      const id = req.params.id;
      await Moto.findByIdAndUpdate(id, body);
      res.json({
        ok: true,
        msg: "post API motos",
        body,
      });
    });
    //delete motos
    this.app.delete('/webresources/generic/motos/:id',  async function (req, res) {
        const id = req.params.id;
        await Moto.findByIdAndDelete(id);
        res.status(200).json({
          ok: true,
          msg: "delete API",
        });
      }
    );

    /******* RUTAS DEL USUARIO */
    this.app.get("/", function (req, res) {});
    this.app.get("/api", async function (req, res) {
      let usuarios = await Usuario.find();
      res.status(403).json({
        ok: true,
        msg: "get API",
        usuarios,
      });
    });
    this.app.get("/suma", function (req, res) {
      const num1 = Number(req.query.num1);
      const num2 = Number(req.query.num2);
      res.send(`La suma de ${num1} y ${num2} es ${num1 + num2}`);
    });

    this.app.post(
      "/api",
      body("correo").isEmail(),
      check("nombre", "El nombre es obligatorio").not().isEmpty(),
      check(
        "password",
        "El password debe tener al menos 6 caracteres"
      ).isLength({ min: 6 }),
      //check('rol','El rol no es válido').isIn(['ADMIN_ROLE','USER_ROLE']),
      check("rol").custom(async function (rol) {
        const existeRol = await Rol.findOne({ rol });
        if (!existeRol) {
          throw new Error(`El rol ${rol} no está en la BD`);
        }
      }),
      check("correo").custom(async function (correo) {
        const existeCorreo = await Usuario.findOne({ correo });
        if (existeCorreo) {
          throw new Error(`El correo ${correo} YA está en la BD`);
        }
      }),

      function (req, res) {
        const body = req.body;
        let usuario = new Usuario(body);
        //valida el correo
        const erroresVal = validationResult(req);
        if (!erroresVal.isEmpty()) {
          return res.status(400).json({ msg: erroresVal.array() });
        }
        //**** le hago el hash a la contraseña */
        const salt = bcryptjs.genSaltSync();
        usuario.password = bcryptjs.hashSync(usuario.password, salt);
        usuario.save();
        res.json({
          ok: true,
          msg: "post API",
          usuario,
        });
      }
    );
    this.app.put("/api/:id", async function (req, res) {
      const id = req.params.id;
      let { password, ...resto } = req.body;
      //**** le hago el hash a la contraseña */
      const salt = bcryptjs.genSaltSync();
      password = bcryptjs.hashSync(password, salt);
      resto.password = password;
      await Usuario.findByIdAndUpdate(id, resto);
      res.status(403).json({
        ok: true,
        msg: "put API",
        id,
        resto,
      });
    });
    this.app.delete("/api/:id", validarJWT, async function (req, res) {
      const id = req.params.id;
      await Usuario.findByIdAndDelete(id);
      res.status(403).json({
        ok: true,
        msg: "delete API",
      });
    });
    this.app.get("/saludo", function (req, res) {
      res.send("<h1>Hola 2DAW</h1>");
    });
    this.app.get("*", function (req, res) {
      res.sendFile(__dirname + "/404.html");
    });
  }

  listen() {
    this.app.listen(port, function () {
      console.log("Escuchando el puerto", port);
    });
  }
}
module.exports = Server;
