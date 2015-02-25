(function(namespace) {

    var http = require('http'),
        https = require('https'),
        querystring = require('querystring'),
        request = require('request'),
        fs = require('fs'),
        mime = require('mime'),
        URL = require('url'),
        instance = null;


    var DeathByCaptcha = function() {};
    DeathByCaptcha.prototype = {

        // Set credentials for logging
        setCredentials: function(credentials) {
            instance.credentials = credentials;
        },

        // Get the image data from an HTTP request
        decodeUrl: function(captchaURL, loopDelay, callback) {
            var url = URL.parse(captchaURL);
            var protocol = http;
            if(url.indexOf('https://') == 0) protocol = https;
            protocol.get({
                host: url.host,
                port: url.port,
                path: url.path
            }, function (response) {
                var imagedata = '';

                response.setEncoding('binary');
                response.on('data', function (chunk) {
                    imagedata += chunk;
                });
                response.on('end', function () {
                    instance._upload(imagedata, response.headers['content-type'], loopDelay, callback);
                });
            });
        },

        // Get the image data from a file
        decodeFile: function(filePath, loopDelay, callback) {
            var contentType = mime.lookup(filePath);
            var file_reader = fs.createReadStream(filePath, {encoding: 'binary'});
            var file_contents = '';

            file_reader.on('data', function (data) {
                file_contents += data;
            });
            file_reader.on('end', function () {
                instance._upload(file_contents, contentType, loopDelay, callback);
            }); 
        },

        // Report invalid captcha
        report: function(captchaId, callback) {
            request.post("http://api.dbcapi.me/api/captcha/" + captchaId + "/report", {
                form: instance.credentials
            }, function (error, response, body) {
                callback(error || false, null);
            });
        },

        // Get remaining credits
        credit: function(callback) {
            request.post("http://api.dbcapi.me/api/user", {
                form: instance.credentials
            }, function (error, response, body) {
                if(error) {
                    callback(error, null);                
                }
                else {
                    var results = querystring.parse(body);
                    if(results.error) {
                        callback(results, null);                    
                    }
                    else {
                        callback(error,results);        
                    } 
                }
            });
        },

        // Get system status (overload, accuracy, ...)
        status: function(callback) {
            request.get("http://api.dbcapi.me/api/status", function (error, response, body) {
                if(error) {
                    callback(error, null);                
                }
                else {
                    var results = querystring.parse(body);
                    if(results.error) {
                        callback(results, null);                    
                    }
                    else {
                        callback(error,results);        
                    } 
                }
            });
        },

        _upload: function(binaryContents, contentType, loopDelay, callback) {
            var boundary = Math.random();

            var post_data = [];
            post_data.push(new Buffer(instance._encodeFieldPart(boundary, 'username', instance.credentials.username), 'ascii'));
            post_data.push(new Buffer(instance._encodeFieldPart(boundary, 'password', instance.credentials.password), 'ascii'));
            post_data.push(new Buffer(instance._encodeFilePart(boundary, contentType, 'captchafile', 'mycaptcha.'+mime.extension(contentType) ), 'binary'));
            post_data.push(new Buffer(binaryContents, 'binary'));
            post_data.push(new Buffer("\r\n--" + boundary + "--"), 'ascii');

            var length = 0, i;
            for (i = 0; i < post_data.length; i++) {
                length += post_data[i].length;
            }

            var post_options = {
                method: 'POST',
                host: 'api.dbcapi.me',
                port: '80',
                path: '/api/captcha',
                headers : {
                    'Content-Type' : 'multipart/form-data; boundary=' + boundary,
                    'Content-Length' : length
                }
            };

            var post_request = http.request(post_options, function (response) {
                response.setEncoding('utf8');

                var complete = "";
                response.on('data', function (chunk) {
                    complete += chunk;
                });
                response.on('end', function () {
                    var results = querystring.parse(complete);

                    if(results.error || results.is_correct !== '1') {
                        callback(results, null);
                    return;
                }

                    var captchaId = results.captcha;

                    if(loopDelay) {
                        instance._pollLoop(captchaId, loopDelay, callback);
                    }
                    else {
                        callback(results);
                    }
                });
            });

            for (i = 0; i < post_data.length; i++) {
                post_request.write(post_data[i]);
            }
            post_request.end();
        },

        _encodeFieldPart: function (boundary, name, value) {
            var return_part = "--" + boundary + "\r\n";
            return_part += "Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n";
            return_part += value + "\r\n";
            return return_part;
        },

        _encodeFilePart: function (boundary, type, name, filename) {
            var return_part = "--" + boundary + "\r\n";
            return_part += "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n";
            return_part += "Content-Type: " + type + "\r\n\r\n";
            return return_part;
        },

        _pollLoop: function(captchaId, loopDelay, callback) {
            setTimeout(function () {
                instance._poll(captchaId, function(err, results) {
                    if (err) {
                        callback(err, null);
                    }
                    else if (results.text === "" || results.text === undefined) {
                        instance._pollLoop(captchaId, loopDelay, callback);
                    }
                    else {
                        callback(null, results);
                    }
                });
            }, loopDelay);
        },
   
        _poll: function(captchaId, callback) {
            var url = "http://api.dbcapi.me/api/captcha/" + captchaId;

            request.get(url, function (error, response, body) {
                var results = querystring.parse(body);
                results.id = results.captcha || null;
                callback(error, results);
            });
        }
    };


    if(!instance) {
        instance = new DeathByCaptcha();
    }
    module.exports = {
        credentials: instance.setCredentials,
        decodeUrl: instance.decodeUrl,
        decodeFile: instance.decodeFile,
        report: instance.report,
        credit: instance.credit,
        status: instance.status       
    };
})(this);
