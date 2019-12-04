var erddap = new ERDDAP("https://erddap.marine.ie/erddap/");

var inspectDataset = function(){
	var dsid = $("#datasets").val() || $("#datasets").find("option:first-child").val();
	if(dsid){
		$("#output").val("generating...");
		generateAPIDocs(erddap,dsid).then(function(apidocs){
			$("#output").val(apidocs);
			$("#output").attr("rows",apidocs.split("\n").length);
			$("#saveas").text("save markdown to slate file includes/_"+dsid+".md")

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

listDatasets();
$("#datasets").change(inspectDataset);
$("#erddap_url").change(function(){
	var erddap_url = $("#erddap_url").val();
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

