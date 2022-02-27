const mongoose = require('mongoose');
const ProductoSchema = mongoose.Schema(
{
    marca: {
        type:String,
        required: [true,'La marca es obligatoria']
    },
    modelo: {
        type:String,
        required: [true,'El modelo es obligatorio']
    },
    cilindrada: {
        type:Number
    },
    precio: {
        type:Number
    },   
     imagen: {
        type:String
    },
}
)
//sobreescribimos un método del Schema para modificar el objeto que exporta
MotoSchema.methods.toJSON = function() {
    const { _id,...producto} = this.toObject() ;
    producto.id=_id;
    return producto;
}

let Producto = mongoose.model('Moto',MotoSchema);
module.exports = Producto;