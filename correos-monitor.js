"use strict";
const request = require("request").defaults({jar: true});
const cheerio = require("cheerio");
const notifier = require("node-notifier");
const settings = require("./settings.json");
//////////////////

let lastDate = null;
let retries = 0;
let notExists = null;
let url = "http://seguimientoweb.correos.cl/ConEnvCorreos.aspx";
let spUrl = "https://api.simplepush.io/send";
let data = {
	"obj_key": "Cor398-cc",
	"obj_env": settings.code
};

if(settings.code === "") {
	console.log("[-] Por favor ingresa el código de seguimiento en el archivo settings.json");
	process.exit();
}

console.log("[~] Iniciando monitor...");
monitor();

/////////////////////

function monitor() {
	request.post(url, {form: data}, (err, res, data) => {
		if(lastDate === null) {
			console.log("[+] Monitor iniciado! Código: " + settings.code);
		}

		try {
			if(err !== null) {
				throw err;
			}

			// Cargar datos
			let $ = cheerio.load(data);
			let t = $('.tracking tr');

			// Tabla existe
			if(t.length > 0) {
				notExists = false;

				// No hay datos, sólo la tabla vacía
				if(t.length < 2) {
					setTimeout(monitor, settings.sleep);
					return;
				}

				let td = $('td', t.eq(1));
				let status = td.eq(0).text().replace(/&nbsp;/g, "").trim();
				let date = td.eq(1).text().replace(/&nbsp;/g, "").trim();
				let location = td.eq(2).text().replace(/&nbsp;/g, "").trim();

				if(date != lastDate) {
					let message = `[${date}] Nuevo estado: ${status}. En: ${location}`;

					notification(message);
					sendPush(message);
					console.log("[+] " + message);
					lastDate = date;
				}
				
				setTimeout(monitor, settings.sleep);

			// Tabla no encontrada
			} else {
				// Mensaje con envío inexistente
				if($('.envio_no_existe').length > 0) {
					if(notExists === null) {
						console.log("[~] El envío no existe, probablemente aparezca pronto.");
						lastDate = "";
						notExists = true;
					}
					setTimeout(monitor, settings.sleep);
				} else {
					// Error no identificado
					throw new Error("Datos incorrectos recibidos");
				}
			}
		} catch(e) {
			console.log("[-] Error: " + err.message);

			if(++retries >= settings.maxRetries) {
				console.log("[-] Máximo de intentos alcanzado. Saliendo...");
				sendPush("Muchos errores ocurridos, se termina el programa.");
				return;
			}
			
			setTimeout(monitor, 5000);
		}
	});
}

// Envía un mensaje push vía SimplePush (app android en la Play Store)
function sendPush(message) {
	if(!("simplepush_key" in settings) || settings.simplepush_key.trim() === "") {
		return;
	}

	var finalUrl = spUrl + "/" + settings.simplepush_key.replace(/\//g, "");
	finalUrl += "/" + encodeURIComponent("Tracking Correos.cl #" + settings.code);
	finalUrl += "/" + encodeURIComponent(message);

	if("simplepush_event" in settings && settings.simplepush_event.trim() !== "") {
		finalUrl += "/event/" + encodeURIComponent(settings.simplepush_event.trim());
	}

	//console.log("push url: " + finalUrl);
	request.get(finalUrl, (err, res, data) =>{
		if(err) {
			throw err;
		}

		try {
			var d = JSON.parse(data);
			
			if(d.status != "OK") {
				console.log("[-] SimplePush retornó un error. " + data);
			}
		} catch(e) {
			throw e;
		}
	});
}

function notification(message) {
	notifier.notify({
		title: 'Nuevo estado seguimiento Correos Chile',
		message: message
	});
}