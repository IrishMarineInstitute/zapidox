var ERDDAP = function(url){
	this.base_url = url.replace(/\/+$/, "");
	this._datasets = {};
}
ERDDAP.prototype.search = function(query,page,itemsPerPage,timeout){
	page = page || 1;
	itemsPerPage = itemsPerPage  || 10000;
	timeout = 5000;
	var url = this.base_url + "/search/index.json?";
	var urlParams = new URLSearchParams("?");
	urlParams.set("searchFor",query);
	urlParams.set("page",page);
	urlParams.set("itemsPerPage",itemsPerPage);
	return fetchJsonp(url + urlParams.toString(),{ timeout: timeout, headers: {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}, jsonpCallback: ".jsonp"})
		.then(function(response) {
			var answer = response.json();
    		return answer;
  		}.bind(this))
  		.then(e2o);
}

var e2o = function(data){
	var keys = data.table.columnNames;
	var results = [];
	data.table.rows.forEach(function(row){
		var result = [];
		for(var i=0;i<keys.length;i++){
			result[keys[i]] = row[i];
		}
		results.push(result);
	});
	return results;
};

var nc_global2o = function(results){
	var info = {};
	results.forEach(function(x){
		if(x["Variable Name"] == "NC_GLOBAL"){
			info[x["Attribute Name"]] = x.Value;
		}
	})

	return info;
}
DATASET = function(erddap,dsid){
	this.erddap = erddap;
	this.dataset_id = dsid;
	this._fetchMetadata =   this.erddap.search("datasetID=" + this.dataset_id).then(function(data){
	      for(var i=0;i<data.length;i++){
	        if(data[i]["Dataset ID"] == this.dataset_id){
	          return data[i];
	        }
	      }
	      throw new Error("Unknown dataset: ["+dataset_id+"]");
	    }.bind(this)).then(function(summary){
	      this._summary = summary;
	      var url = this.erddap.base_url + "/info/" + this.dataset_id + "/index.json";
	      return fetchJsonp(url,{jsonpCallback: ".jsonp"}).then(function(response) {
	    if(response.ok){
	      return response.json();
	    }else{
	      throw new Error("Error fetching "+url);
	    }
	  }).then(function(response) {
	    var obj = {};
	    for (var i = 0; i < response.table.rows.length; i++) {
	      var row = response.table.rows[i];
	      obj[row[0]] = obj[row[0]] || {};
	      obj[row[0]][row[1]] = obj[row[0]][row[1]] || {};
	      obj[row[0]][row[1]][row[2]] = obj[row[0]][row[1]][row[2]] || {};
	      obj[row[0]][row[1]][row[2]].type = row[3];
	      obj[row[0]][row[1]][row[2]].value = row[4];
	    };
	    return (obj);
	  }).then(function(info) {
	    var param_encoder = {};
	    var dataset = {
	      _fieldnames: []
	    };
	    var wanted = ["dimension", "variable"];
	    for (var x = 0; x < wanted.length; x++) {
	      var dimvar = wanted[x];
	      if (!info[dimvar]) {
	        continue;
	      }

	      if (dimvar == "dimension") {
	        dataset.dimensions = {};
	      }

	      for (var key in info[dimvar]) {
	        dataset._fieldnames.push(key);
	        var etype = info[dimvar][key][""]["type"];
	        var evalue = "" + info[dimvar][key][""]["value"];
	        var gtype = null;
	        var atype = null
	        switch (etype) {
	          case 'float':
	          case 'double':
	            param_encoder[key] = function(v) {
	              return isNaN(v) ? null : v
	            };
	            break;
	          case 'int':
	          case 'long':
	          case 'short':
	          case 'byte':
	            param_encoder[key] = function(v) {
	              return isNaN(v) ? null : v
	            };
	            break;
	          case 'char':
	          case 'String':
	            param_encoder[key] = function(v) {
	              return '"' + v + '"'
	            };
	            break;
	          default:
	            throw 'Unknown type [' + etype + '] for ' + dataset.id + '.' + key;
	        }

	        var isTimeField = false;
	        if (info.attribute[key] && info.attribute[key]["_CoordinateAxisType"]) {
	          var axisType = info.attribute[key]["_CoordinateAxisType"].value;
	          switch (axisType) {
	            case "Time":
	              dataset.time_dimension = key;
	              param_encoder[key] = time_encoder;
	              param_encoder['since'] = time_encoder;
	              param_encoder['until'] = time_encoder;
	              break;
	            case "Lat":
	              dataset.lat_dimension = key;
	              break;
	            case "Lon":
	              dataset.lon_dimension = key;
	              break;
	          }
	        }

	        if (dimvar != "dimension" && info.dimension && evalue) {
	          dataset.dimensions[key] = evalue.split(/[ ,]+/);
	        }
	/*
	        if (info.attribute[key]) {
	          if (info.attribute[key]["ioos_category"] && info.attribute[key]["ioos_category"].value == "Time") {
	            dataset.time_dimension = key;
	            param_encoder[key] = time_encoder;
	          }
	        }
	        */

	      }

	    }
	    dataset.param_encoder = param_encoder;
	    dataset.base_url = this.erddap.base_url;
	    dataset.id = this.dataset_id;
	    dataset.info = info;
	    this._meta = dataset;
	    return dataset;
	  }.bind(this));
	}.bind(this));

}

DATASET.prototype.fetchMetadata = function(){
	return this._fetchMetadata;
}

ERDDAP.prototype.dataset = function(dsid){
	this._datasets[dsid] = this._datasets[dsid] || new DATASET(this,dsid);
	return this._datasets[dsid];
}


function time_encoder(value,istabledap) {
  if(value instanceof Date){
    return istabledap ? value.toISOString2() : ("("+value.toISOString2()+")");
  }
  if(value == "closest"){
    return TIME_CLOSEST_PLACEHOLDER;
  }
  if(value == "first"){
    return 0;
  }
  if(value == "last"){
    return value;
  }
  try {
    var m = moment(chrono.parseDate(value));
    if (m.isValid()) {
      m = m.toDate().toISOString2();
      if (m) {
        return istabledap? m : ("("+m+")");
      }
    }
    return value;
  } catch (e) {
    console.log(e);
    return value;
  }
}