const {response,request} = require('express');
const jwt = require('jsonwebtoken');
const generarJWT = ( id = '' ) => {
    return new Promise( (resolve, reject) => {

        const payload = { id };

      //  jwt.sign( payload, process.env.SECRETORPRIVATEKEY, {   NO ME FUNCIONA CON SECRETOPRIVATEKEY
        jwt.sign( payload,'JuanMiguelHurtado', {
            expiresIn: '4h'
        }, ( err, token ) => {

            if ( err ) {
                console.log(err);
                reject( 'No se pudo generar el token' )
            } else {
                resolve( token );
            }
        })

    })
}
module.exports = {
    generarJWT
}