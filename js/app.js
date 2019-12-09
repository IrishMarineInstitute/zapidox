
var erddap = undefined;
$(document).ready(function(){
	$("#datasets").change(inspectDataset);
	$("#erddap_url").change(function(){
		console.log("yes");
		var erddap_url = $("#erddap_url").val();
		if(!erddap_url){
			return;
		}
		$("#datasets").empty();
		try{
			new URL(erddap_url);
			var e = new ERDDAP(erddap_url);
			e.search("tabledap").then(function(){
				erddap = e;
				listDatasets();
			},function(e){
				console.log("failed to load ERDDAP from "+erddap_url,e);
			});
		}catch(e){
			console.log("could not load ERDDAP from "+erddap_url,e);
		}
	})
	if(typeof(window.awesomeErddaps) !== 'undefined'){
		awesomeErddaps.forEach((o)=>{
			var e = new ERDDAP(o.url);
			e.search("tabledap").then(function(){
				$("#erddap_url").append(new Option(o.name?o.name:o.url, o.url));
			},function(xxx){});
		});
	}
});

var inspectDataset = function(){
	var dsid = $("#datasets").val() || $("#datasets").find("option:first-child").val();
	if(dsid){
		$("#output").val("generating...");
		$("#preview").text("generating...");
		var options = {bootstrap4: true};
		generateAPIDocs(erddap,dsid,options).then(function(apidocs){
			$("#output").val(apidocs);
			$("#output").attr("rows",apidocs.split("\n").length);
			$("#saveas").text("save markdown to slate file includes/_"+dsid+".md")

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
				var result = md.render(apidocs);
				$("#preview").empty();
				$("#preview").append($(result));
				$("#output").hide();


			}

		})
	}
}
var listDatasets = function(){
	$('#datasets').empty();
	erddap.search("tabledap").then(function(datasets){
		if(datasets && datasets.length){
			var dsids = datasets.map((ds)=>ds["Dataset ID"]).sort();
			dsids.forEach(function(id){
				$("#datasets").append($("<option></option>")
				.attr("value",id).text(id));
			});
			inspectDataset();
		}
	});
}


