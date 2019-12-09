
var getErddapZapidocs = function(query_url){
	// get the current zapidocs from ERDDAP, either as an object,
	// or as a string if the current value doesn't parse to a json object.
   return new Promise(function(resolve,reject){
       try{
          	var erddap_url = new URL(query_url.replace(/\/(table|grid)dap.*$/g,"/")).toString();
          	var erddap = new ERDDAP(erddap_url);
          	var dataset_id = query_url.substring(erddap_url.length).split(/[\?\.\/]/)[1];
          	var ds = erddap.dataset(dataset_id);
	 		ds.fetchMetadata().then(function(meta){
	 			resolve(_getMetaZapidocs(meta));
	 		});
       }catch(e){
          reject(e);
       }
   });
}
var _getMetaZapidocs = function(meta){
			var ncglobal = meta.info.attribute["NC_GLOBAL"];
			var zapidox = (ncglobal.zapidox && ncglobal.zapidox.value) || "[]";
			if(zapidox){
				try{
					zapidox = JSON.parse(zapidox);
				}catch(e){
					console.log("couldn't parse zapidox attribute",e);
				}
			}
			return zapidox;
}
var generateAPIDocs = function(erddap, dataset_id, options){
	options = options || {bootstrap4: false}; // use markdown-it to translate to html.
	if(options.tableInTitle === undefined){
		options.tableInTitle = options.bootstrap4 ? false: true;
	}
	return new Promise(function(resolve,reject){
		var ds = erddap.dataset(dataset_id);
		ds.fetchMetadata().then(function(meta){
			var joinParts = function(toc,parts){
				if(toc.length && options.bootstrap4){
					toc.unshift("<p><a href='#'>Overview</a></p>");

				   var body = parts.join("\n\n");
				   return [
				   	'<div class="row">',
				   	'<div class="col-sm-2 bg-light">',
				   	'<div class="sticky-top">',
				   	toc.join("\n"),
				   	'</div>',
				   	'</div>',
				   	'<div class="col-sm-10">',
				   	'',
				   	body,
				   	'</div>',
				   	'</div>'].join("\n");
				}
				return parts.join("\n\n");
			}
			var toc = [];
			var ncglobal = meta.info.attribute["NC_GLOBAL"];
			var overview = getOverview(ncglobal, erddap.base_url, dataset_id);
			var variables = getVariablesTable(meta, dataset_id, options, toc);
		    var parts = [overview,variables];
		    var zapidox = _getMetaZapidocs(meta);
			if(typeof(zapidox) == "object" && zapidox.length){
				var docs = [];
				var generateZDocs = function(method){
					generateMethodDocs(ds,method,options, toc).then(function(result){
						parts.push(result);
						if(zapidox.length){
							generateZDocs(zapidox.shift());
						}else{
							resolve(joinParts(toc,parts));
						}
					});

				}
				generateZDocs(zapidox.shift());
			}else{
				resolve(joinParts(toc,parts));
			}
		});
	});
}
var getJavascriptFunction = function(url,params){
	var output = [];
	output.push('var url = new URL("'+url+'"),');
    output.push('params = '+JSON.stringify(params,null,4)+";");
    output.push("");

    output.push("url = url + '?' + params.map(v => typeof(v)=='string'? encodeURIComponent(v) :");
    output.push("     (encodeURIComponent(Object.keys(v)[0]) + '=' + encodeURIComponent(Object.values(v)[0]))");
    output.push(  ").join('&');");
    output.push("");
	output.push("fetch(url)");
	output.push("    .then(response => response.text())");
	output.push("    .then((data)=>{");
	output.push("      console.log(data);");
	output.push("    });");

	return output.join("\n");
}
var getPythonFunction = function(url,params,query){
	var output = [];
	output.push("import requests");
	output.push("# commented code requires requests > 2.2.0");
	output.push("# see https://github.com/psf/requests/issues/2651");
	output.push("#  params = (");
	for(var i=0;i<params.length;i++){
		var o = params[i];
		var line = "#   '"+ o + "': None";
		if(typeof(o) != 'string'){
			line = "#   '"+Object.keys(o)[0]+"': '"+Object.values(o)[0]+"'";
		}
		if(i+1<params.length){
			line += ","
		}
		output.push(line);
	}
	output.push("# )");
	output.push("# r = requests.get('"+url+"', params=params)")
	output.push("r = requests.get('"+url+"?"+query+"')")
	output.push("r.text")
	output.push("#")
    return output.join("\n");
}
var getRFunction = function(url,params){
	var output = [];
	output.push("require(httr)");
	var options = [], args = {};
	params.forEach(o=>{
		if(typeof(o) == 'string'){
			options.push(o);
		}else{
			args[Object.keys(o)[0]] = Object.values(o)[0];
		}
	});
	output.push("params <- list()");
	Object.keys(args).forEach(key=>{
		output.push("params[[ '"+key+"' ]] <- '" + args[key] + "'");
	})
	output.push("");

	var fields = options.shift();
	output.push("fields <- '"+fields+"'");

	output.push("options <- list(");
	output.push("    fields"+(options.length?",":""));
	output.push(options.map(o=>"    '"+o+"'").join(",\n"));
	output.push(")")
	output.push("options <- lapply(options, URLencode, reserved=TRUE)");
	output.push("");
	output.push('url <- sprintf("'+ url +'?%s", '+"paste(options, collapse='&'))");
	output.push("response = GET(url, params=params)")
    return output.join("\n");

}
var getQueryOutput = function(url,params){
		url = url + '?' + params.map(v => typeof(v)=='string'? encodeURIComponent(v) :
	     (encodeURIComponent(Object.keys(v)[0]) + '=' + encodeURIComponent(Object.values(v)[0]))
	).join('&');
	return fetch(url)
		.then(response => response.text())
		.then(data => {
			var lines = data.split("\n");
			if(lines.length > 24){
				lines = lines.splice(0,15);
				lines.push("...");
			}
			return lines.join("\n");
		});
}
var generateMethodDocs = function(dataset, method,options, toc){
	return new Promise(function(resolve,reject){
		var formats = method.formats || [".csv0"]
		var output = [];
		var generateFormatMethodDocs = function(format){
			var outputformat = {}[format] || format.replace(/^[^a-zA-Z]/g,"").replace(/[^a-zA-Z]$/g,"");
			var formatNoExtension = format.replace(/^\./,"");
			var base_url = dataset._summary.tabledap || dataset._summary.griddap;
			var partial_url = base_url + "." + formatNoExtension
			var full_url =  partial_url + "?" + method.query;
			var params = [];
			var searchParams = new URL(full_url).searchParams;
			searchParams.forEach((i,k)=>{
				if (searchParams.get(k).length || method.query.indexOf(k+"=")>=0 || method.query.indexOf(encodeURIComponent(k)+"=")>=0){
					var param = {};
					param[k] = searchParams.get(k);
					params.push(param);
				}else{
				  params.push(k);	
				}
			});

			var id_prefix = (dataset.dataset_id+"-"+method.name+"-"+formatNoExtension).replace(/\W/,'-').replace(/--/g,'-').toLowerCase();

			output.push("");
			if(options.tableInTitle){		
				output.push(["## ",dataset.dataset_id,": ",method.name," (", formatNoExtension, ")"].join(""));
			}else{
				var title = method.name + " (" + formatNoExtension + ")";
				if(options.bootstrap4){
					toc.push(["<p>",'<a href="#',id_prefix,'">',title,"</a></p>"].join(""));
					output.push('<hr/><div class="row"><div class="col-sm-7">')
					output.push(["<h2 id='"+id_prefix+"'>",title,"</h2>"].join(""));
				}else{
					output.push("## " + title);
				}
			}
			output.push("");
			output.push(method.description);
			output.push("");

			var getBeforeCode = function(lang){return "\n```"+lang};
			var getAfterCode = function(){return "```"};
			var output_end = "";

			if(options.bootstrap4){
				output_end = "</div></div>";
				output.push("\n");
				output.push('</div><div class="col-sm-5">');
				output.push('<ul class="nav nav-pills mb-5" id="pills-'+id_prefix+'-tab" role="tablist">');
				var selected = true;
				["shell","python","r","javascript","csharp"].forEach((lang)=>{
					var fix = id_prefix+'-'+lang
					output.push('<li class="nav-item">');
					output.push('<a class="nav-link'+(selected?" active":"")+'" id="pills-'+fix+'-tab" data-toggle="pill" href="#pills-'+fix+'" role="tab" aria-controls="pills-'+fix+'" aria-selected="'+selected+'">'+lang+'</a>')
					output.push('</li>');
					selected = false;
				});
				output.push("</ul>");
				output.push('<div class="tab-content" id="pills-'+id_prefix+'-tabContent">');
				getBeforeCode = function(lang,active){
					var fix = id_prefix+'-'+lang
					return '<div class="tab-pane fade'+(active?" show active":"")+'" id="pills-'+fix+'" role="tabpanel" aria-labelledby="pills-'+fix+'-tab">\n\n```'+lang;
				}
				getAfterCode = function(){return "```\n\n</div>"};
			}

			output.push(getBeforeCode("shell",true));
			output.push("curl '"+full_url.replace(/'/,"\\'")+"'")
			output.push(getAfterCode());
			output.push(getBeforeCode("python"));
			output.push(getPythonFunction(partial_url, params, method.query))
			output.push(getAfterCode());
			output.push(getBeforeCode("r"));
			output.push(getRFunction(partial_url, params, method.query))
			output.push(getAfterCode());
			output.push(getBeforeCode("javascript"));
			output.push(getJavascriptFunction(partial_url, params))
			output.push(getAfterCode());
			output.push(getBeforeCode("csharp"));
			output.push("// csharp code coming soon....(ish)")
			output.push(getAfterCode());
			if(options.bootstrap4){
				output.push("</div>\n");
			}
			output.push("> The above commands return "+outputformat.toUpperCase()+" structured like this:");
			output.push("");
			output.push("```"+outputformat);


			getQueryOutput(partial_url, params).then(queryOutput => {
			 	output.push(queryOutput);
				output.push("```");
				output.push(output_end);
				if(formats.length){
					generateFormatMethodDocs(formats.shift());
				}else{
					resolve(output.join("\n"));
				}
		   });

		}
		generateFormatMethodDocs(formats.shift());
	});
}

var getOverview = function(ncglobal,erddap_url, dataset_id){
	var headline = [
		"The [",ncglobal.title.value,"](",ncglobal.infoUrl.value,
		") dataset is hosted in [ERDDAP](",
		erddap_url,
		"info/",
		dataset_id,
		"/index.html)"
		].join("");
	
	var output =[ 
	    "# "+ncglobal.title.value, 
	    "", 
	    headline, 
	    "", 
	    ncglobal.summary.value];
	return output.join("\n");

}
var getVariablesTable = function(meta,dataset_id,options,toc){
	var rows = [["Variable","Type","Comment"],["----","----","-------"]];
	var maxlen = [0,0,0];
	meta._fieldnames.forEach(function(fieldname){
		if(meta.info.variable[fieldname]){
			var v = meta.info.variable[fieldname];
			var attr = meta.info.attribute[fieldname];
			var comment = attr.Comment?attr.Comment.value:(attr.long_name?attr.long_name.value.indexOf(' ')>0?attr.long_name.value:"":"");
			var row = [fieldname,v[""].type, comment];

			for(var i=0;i<row.length;i++){
				maxlen[i] = Math.max(maxlen[i],row[i].length)
			}
			rows.push(row);
		}
	});
	var output = [];
	rows.forEach(function(row){
		for(var i=0;i<maxlen.length;i++){
			row[i] = row[i].padEnd(maxlen[i]," ");
		}
		output.push(row.join(" | "));
	});
	output[1] = output[1].replace(/\s/g,"-").replace("-|-"," | ");

	output.unshift("");
	if(options.tableInTitle){
		output.unshift("## "+dataset_id+": Variables");
	}else{
		if(options.bootstrap4){
			var id = dataset_id+"--variables";
			output.unshift("<h2 id='"+id+"'>Variables</h2>");
			output.unshift('<div class="row"><div class="col-sm-7">');
			output.push('</div><div class="col-sm-6"></div></div>');
			toc.push("<p><a href='#"+id+"'>Variables</a></p>");
		}else{
			output.unshift("## Variables");
		}
	}
	return output.join("\n");
}
