
var parseErddapUrl = function(query_url){
	var erddap_url = new URL(query_url.replace(/\/(table|grid)dap.*$/g,"/")).toString();
    var dataset_id = query_url.substring(erddap_url.length).split(/[\?\.\/]/)[1];
    var query = query_url;
    if(query.indexOf('?')>=0){
    	query = query.substring(query.indexOf('?')+1);
    }
    return {erddap_url: erddap_url, dataset_id: dataset_id, query: query};
}

var getErddapZapidocs = function(query_url){
	// get the current zapidocs from ERDDAP, either as an object,
	// or as a string if the current value doesn't parse to a json object.
   return new Promise(function(resolve,reject){
       try{
       		var parsed = parseErddapUrl(query_url);
          	var erddap = new ERDDAP(parsed.erddap_url);
          	var ds = erddap.dataset(parsed.dataset_id);
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
			if(typeof(zapidox) == 'object' && zapidox.length == 0){
				var defaultDataQuery = "";
				var methodName = "getSomeData";
				var description = "Fetch 10 rows of data";
				if(ncglobal.defaultDataQuery){
					defaultDataQuery = '&' + (ncglobal.defaultDataQuery.value.replace(/&orderByLimit[^&]*/,"").replace(/^&/,""));
					methodName = "getDefaultData";
					description += " using the defaultDataQuery";
				}
				zapidox = [
					{
						name: methodName,
						description: description,
						formats: [".csv0", ".jsonlKVP"],
						query: meta._fieldnames.join(",")+defaultDataQuery+'&orderByLimit("10")'
					}
					];
			}
			return zapidox;
}
var generateAPIDocs = function(erddap, dataset_id, options){
	options = options || {bootstrap4: false}; // use markdown-it to translate to html.
	if(options.tableInTitle === undefined){
		options.tableInTitle = options.bootstrap4 ? false: true;
	}
	if(!options.format){
		
		options.format = function(docs){
			return docs;
		}

		if(window.markdownit && options.bootstrap4){
			var mdoptions = {
				html: true,
				linkify: true
			};
			if(window.hljs){
				mdoptions.highlight = function (str, lang) {
			    if (lang && hljs.getLanguage(lang)) {
			      try {
			        return '<pre class="hljs"><code>' +
			               hljs.highlight(lang, str, true).value +
			               '</code></pre>';
			      } catch (__) {}
			    }

			    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
			  }
			};
			var md = window.markdownit(mdoptions);
			md.renderer.rules.table_open = function(tokens, idx) {
				    return '<table class="table table-sm">';
			};
			options.format = function(docs){
				return md.render(docs);
			}
		}
	}
	return new Promise(function(resolve,reject){
		var ds = erddap.dataset(dataset_id);
		ds.fetchMetadata().then(function(meta){
			var dataset_link = getDatasetLink(erddap.base_url,dataset_id);
			var joinParts = function(toc,parts){
				if(toc.length && options.bootstrap4){
					var id = dataset_link+"|--overview";
					toc.unshift("<p><a href='#"+id+"'>Overview</a></p>");
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
			var overview = getOverview(ncglobal, dataset_link, options);
			var variables = getVariablesTable(meta, dataset_id, options, toc, dataset_link);
			var exampleQuerySection = [
				"# Example Queries",
				"","Below are some example queries to get you started with "+ncglobal.title.value
			].join("\n")
		    var parts = [overview,variables,exampleQuerySection];
		    var zapidox = options.zapidox || _getMetaZapidocs(meta);
			if(typeof(zapidox) == "object"){
				var docs = [];
				var generateZDocs = function(method){
					generateMethodDocs(ds,method,options, toc, dataset_link).then(function(result){
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
var getPythonFunction = function(url,params,query,format){
	var output = [];
	output.push("import requests");
	output.push("import pandas as pd");
	output.push("from io import StringIO");
	output.push("")
	output.push("url = '"+url+"'")
	output.push("fields = '"+params[0]+"'");
	output.push("params = [")
	output.push("    fields")
	for(var i=1;i<params.length;i++){
		var o = params[i];
		var line = "   ,'"+ o + "'";
		if(typeof(o) != 'string'){
			line = "   ,'"+Object.keys(o)[0]+"="+Object.values(o)[0]+"'";
		}
		output.push(line);
	}
	output.push("]");
	output.push("response = requests.get( url + '?' + '&'.join(params))")
	output.push("response.raise_for_status()")
	output.push("")
	output.push("# error raised above if request failed")
	if(format.toLowerCase().startsWith(".csv")){
		output.push("df = pd.read_csv(StringIO(response.text), names=fields.split(','), parse_dates=['time'])")
		output.push("df.head()")
	}else if(format.toLowerCase().startsWith(".jsonlkvp")){
		output.push("jsonlKVP = '[' + ','.join(response.text.strip().split('\\n'))+']'")
		output.push("df = pd.read_json(jsonlKVP, orient='records')")
		output.push("df.head()")
	}else{
		output.push("response.text");
	}
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
var json2csv0 = function(data){
	return Papa.unparse(data.table.rows);
}
var json2jsonlKVP = function(data){
	var lines = [];
	colNames = data.table.columnNames;
	ncols = colNames.length;
	var nrows = data.table.rows.length;
	for(var i = 0; i<nrows; i++){
		var line = {};
		var row = data.table.rows[i];
		for(var j=0; j<ncols; j++){
			line[colNames[j]] = row[j];
		}
		lines.push(JSON.stringify(line));
	}
	return lines.join("\n");
}
var getQueryOutput = function(url,params){
	var reformat = {
		"csv0": json2csv0,
		"jsonlKVP": json2jsonlKVP
	}
	var formatWanted = false;
	var rx = /\.([^\.]*)$/;
	var arr = rx.exec(url);
	if(arr.length == 2){
		formatWanted = arr[1];
	}
	var fnFormat = reformat[formatWanted];


    var url = url.replace(rx,".json"); // for jsonp test
		url = url + '?' + params.map(v => typeof(v)=='string'? encodeURIComponent(v) :
	     (encodeURIComponent(Object.keys(v)[0]) + '=' + encodeURIComponent(Object.values(v)[0]))
	).join('&');

	url = url + (url.endsWith("?")? "" : "&") + 'orderByLimit("15")';

	//fetchJsonp(url + urlParams.toString(),{ timeout: timeout, headers: {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}, jsonpCallback: ".jsonp"})
	return fetchJsonp(url, {jsonpCallback: ".jsonp"})
		.then(response => response.json())
		.then(data => {
				if(fnFormat){
					try{
						return fnFormat(data);
					}catch(e){
						console.log("failed to reformat data from json to "+formatWanted,e);
					}
				}
			data = JSON.stringify(data);
			var lines = data.split("\n");
			if(lines.length > 24){
				lines = lines.splice(0,15);
				lines.push("...");
			}
			return lines.join("\n");
		});
}
var generateMethodDocs = function(dataset, method,options, toc, dataset_link){
	return new Promise(function(resolve,reject){
		var formats = method.formats || [".csv0"]
		var output = [];
		var generateFormatMethodDocs = function(format){
			format = format || "";
			var outputformat = {}[format] || format.replace(/^[^a-zA-Z]/g,"").replace(/[^a-zA-Z]$/g,"");
			var formatNoExtension = format.replace(/^\./,"");
			var base_url = dataset._summary.tabledap || dataset._summary.griddap;
			var partial_url = base_url + "." + formatNoExtension
			var full_url =  partial_url + "?" + method.query;
			var params = [];
			if(full_url.startsWith("//")){
				full_url = location.protocol+full_url;
			}
			//console.log(full_url);
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

			var id_prefix = dataset_link + "|" + (dataset.dataset_id+"-"+method.name+"-"+formatNoExtension).replace(/\W/,'-').replace(/--/g,'-').toLowerCase();

			output.push("");
			if(options.tableInTitle){		
				output.push(["## ",dataset.dataset_id,": ",method.name," (", formatNoExtension, ")"].join(""));
			}else{
				var title = method.name + " (" + formatNoExtension + ")";
				if(options.bootstrap4){
					toc.push(["<p>",'<a href="#',id_prefix,'">',title,"</a></p>"].join(""));
					output.push('<hr id="'+id_prefix+'" /><div class="row"><div class="col-sm-7">')
					output.push(["<h2>",title,"</h2>"].join(""));
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
					var fix = (id_prefix+'-'+lang).replace(/[^\w\-\d_]/g,'-');
					output.push('<li class="nav-item">');
					output.push('<a class="codetab nav-link'+(selected?" active ":" ")+lang+'-lang" id="pills-'+fix+'-tab" data-lang=".'+lang+'-lang" data-toggle="pill" href="#pills-'+fix+'" role="tab" aria-controls="pills-'+fix+'" aria-selected="'+selected+'">'+lang+'</a>')
					output.push('</li>');
					selected = false;
				});
				output.push("</ul>");
				output.push('<div class="tab-content" id="pills-'+id_prefix+'-tabContent">');
				getBeforeCode = function(lang,active){
					var fix = (id_prefix+'-'+lang).replace(/[^\w\-\d_]/g,'-');
					return '<div class="tab-pane fade'+(active?" show active":"")+'" id="pills-'+fix+'" role="tabpanel" aria-labelledby="pills-'+fix+'-tab">\n\n```'+lang;
				}
				getAfterCode = function(){return "```\n\n</div>"};
			}

			output.push(getBeforeCode("shell",true));
			output.push("curl '"+full_url.replace(/'/,"\\'")+"'")
			output.push(getAfterCode());
			output.push(getBeforeCode("python"));
			output.push(getPythonFunction(partial_url, params, method.query, format))
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

			var queryResultToMarkdown = function(result){
				var o = [];
				o.push("> The above commands return "+outputformat.toUpperCase()+" structured like this:");
				o.push("");
				o.push("```"+outputformat);
				o.push(result);
				o.push("```");
				return o.join("\n");
			}

			var continueOrResolve = function(result){
				if(result){
					output.push(queryResultToMarkdown(result));
				}
				output.push(output_end);
				if(formats.length){
					generateFormatMethodDocs(formats.shift());
				}else{
					resolve(output.join("\n"));
				}
			}
			if(options.bootstrap4){
				output.push("</div>\n");
				// in case of generating html in the browser,
				// the output code examples are added after.
				var output_id = id_prefix+'-output';
				output.push('<div id="'+output_id+'">(fetching output)</div>');
				continueOrResolve();
				getQueryOutput(partial_url, params).then(queryOutput => {
				 	$(document.getElementById(output_id)).html(options.format(queryResultToMarkdown(queryOutput)));
			   }, function(e){
				   	$(document.getElementById(output_id)).html(options.format(queryResultToMarkdown("sorry the request failed, an example is not available at this time.")));
			   });
			}else{
				getQueryOutput(partial_url, params).then(queryOutput => {
				 	continueOrResolve(queryOutput);
			   }, function(e){
				   	continueOrResolve("sorry the request failed, an example is not available at this time.");
			   });
			}

		}
		generateFormatMethodDocs(formats.shift());
	});
}

var getDatasetLink = function(erddap_url, dataset_id){
	//TODO: might not be tabledap.
	return [erddap_url,
	     erddap_url.endsWith("/")?":":"/",
		"tabledap/",
		dataset_id,
		".html"].join("");
}
var getOverview = function(ncglobal,dataset_link,options){
	var headline = [
		"The [",ncglobal.title.value,"](",ncglobal.infoUrl.value,
		") dataset is hosted in [ERDDAP]("+dataset_link+")"
		].join("");
	
	var output =[ 
		"", 
	    headline, 
	    "", 
	    ncglobal.summary.value,
	    ];
		if(options.bootstrap4){
			var id = dataset_link+"|--overview";
			output.unshift("<h2 id='"+id+"'>Overview</h2>");
			output.unshift('<div class="row"><div class="col-sm-12">');
			output.push('</div></div>');
		}else{
			output.unshift("# "+ncglobal.title.value);
		}
    
	output.push("");
	output.push("## Tabledap Data Access Protocol");
	output.push("Data from the "+ncglobal.title.value+" dataset can be fetched in [many formats]("+(dataset_link.replace(/[^\/]*$/,"documentation.html"))+") using simple (restful) http requests.");
	output.push("");
	output.push("The [data access form]("+dataset_link+") is a great way to get started, or to refine your query.");
	output.push("");

	/*
	output.push("The general format for tabledap queries is " +
		"<a href='"++"' title='"+dataset_link.replace(/.html$/,"")+"'>dataset_link</a>.<span title='eg. htmlTable, csv, nc, etc.'>format</span>?comma_separated_variable,&filter&anotherFilter")
    */
	return output.join("\n");

}
var getVariablesTable = function(meta,dataset_id,options,toc,dataset_link){
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
			var id = dataset_link+"|"+dataset_id+"--variables";
			output.unshift("<h2 id='"+id+"'>Variables</h2>");
			output.unshift('<div class="row"><div class="col-sm-12">');
			output.push('</div></div>');
			toc.push("<p><a href='#"+id+"'>Variables</a></p>");
		}else{
			output.unshift("## Variables");
		}
	}
	return output.join("\n");
}
