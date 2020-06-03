
var erddap = undefined;
$(document).ready(function(){
	$("#datasets").change(inspectDataset);
	$("#erddap_url").change(function(){
		var erddap_url = $("#erddap_url").val();
		if(!erddap_url){
			return;
		}
		$("#datasets").empty();
		$("#erddap_name").text($('#erddap_url option:selected').text());
		try{
			new URL(erddap_url);
			var e = new ERDDAP(erddap_url);
			e.search("tabledap").then(function(){
				erddap = e;
				listDatasets();
			},function(e){
				console.log("failed to load ERDDAP from "+erddap_url,e);
			});
		}catch(eignore){}
	})
	var apidoxFromHash = function(){
		var url = (window.location.href.split("#")[1] || "").split('|')[0];
		if(url){
			try{
				new URL(url);
				var example = undefined;
				if(url.indexOf('?')>=0){
					//assume the end of the url to be an example query
					var example_query = url.split('?')[1];
					example = {name: "exampleDataQuery", 
						description: `This is an example of how to access 
						the requested data from the ERDDAP server.`,
						query: example_query}
				}
				var erddap_url = new URL(url.replace(/\/(table|grid)dap.*$/g,"/")).toString();
				$("#erddap_url").val(erddap_url);
				if(!$("#erddap_url").val()){
					$("#erddap_url").append(new Option(erddap_url, erddap_url));
					$("#erddap_url").val(erddap_url);
				}
          		var e = new ERDDAP(erddap_url);
          		var dataset_id = url.substring(erddap_url.length).split(/[\?\.\/]/)[1];
          		if(dataset_id){
	          		e.search(dataset_id).then(function(){
					erddap = e;
					listDatasets(dataset_id, example);
				},function(e){
					console.log("failed to load ERDDAP from "+erddap_url,e);
				});
          	}


			}catch(err){
				console.log("could not autoload "+url,err);
			}
		}

	}
	if(typeof(window.awesomeErddaps) !== 'undefined'){
		awesomeErddaps.forEach(function(o){
			console.log(o.url);
			o.name = o.name || (o.url || "").replace(/^[^\/]*\/\//,"");
		});
		awesomeErddaps.sort((a, b) => (a.name.toLowerCase() == b.name.toLowerCase() ? 0 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
		awesomeErddaps.forEach((o)=>{
			var selected = false;
			if($("#erddap_url").val() == o.url){ //TODO: try without the trailing slash.
				$('#erddap_url').find('option:selected').remove();
				selected = true;
			}
			var newOption = new Option(o.name, o.url, false, selected);
			$("#erddap_url").append(newOption);
		})
		awesomeErddaps.forEach((o)=>{
			var e = new ERDDAP(o.url);
			e.search("tabledap").then(function(){
				// pass (add a green checkmark?)

			},function(xxx){
				$("#erddap_url > option").each(function() {
   					 if(this.value == o.url){
   					 	$(this).text("(offline) "+$(this).text());
   					 	$(this).attr('disabled','disabled');
   					 }
				});
			});
		});
	}
	apidoxFromHash();
});

var inspectDataset = function(e,example){
	var dsid = $("#datasets").val() || $("#datasets").find("option:first-child").val();
	if(dsid){
		$("#output").val("generating...");
		$("#preview").text("generating...");
		var options = {bootstrap4: true, example: example};

		generateAPIDocs(erddap,dsid,options).then(function(apidocs){
			var docid = getDatasetLink(erddap.base_url,dsid);
			$(":root").attr('id',docid);
			if(!window.location.hash.startsWith("#"+docid)){
				window.location.hash = docid;
			}
			$("#editor_link").prop("href","./editor/"+window.location.hash.split("|")[0]);
			$("#output").val(apidocs);
			$("#output").attr("rows",apidocs.split("\n").length);
			$("#saveas").text("save markdown to slate file includes/_"+dsid+".md");
			var result = options.format(apidocs);
			$("#preview").empty();
			$("#preview").append($(result));
			$("#output").hide();
			var oldhash =  window.location.hash.substring(1);
			if(example && example.hash){
				oldhash = example.hash;
			}
			window.location.hash = "#";
			setTimeout(function(){
				window.location.hash = oldhash;
			},0);

		})
	}
}
var listDatasets = function(selected, example){
	$('#datasets').empty();
	erddap.search("tabledap").then(function(datasets){
		if(datasets && datasets.length){
			var dsids = datasets.map((ds)=>ds["Dataset ID"]).sort();
			dsids.forEach(function(id){
				var $el = $("<option></option>").attr("value",id).text(id);
				if(selected && id == selected){
					$el.attr('selected',true);
				}
				$("#datasets").append($el);
			});
			inspectDataset(null,example);
		}
	});
}


