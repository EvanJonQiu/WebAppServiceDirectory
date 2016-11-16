define(["dojo/_base/declare",
        "jimu/BaseWidget",
        "dojo/store/Memory",
        "dijit/Tree",
        "dojo/dom",
        "dojo/data/ItemFileReadStore",
        "dijit/tree/ForestStoreModel",
        "dijit/form/CheckBox",
        "esri/layers/FeatureLayer",
        "esri/layers/ArcGISDynamicMapServiceLayer",
        "esri/layers/ArcGISTiledMapServiceLayer",
        "dojo/_base/lang",
        "dojo/topic"],
  function(declare, BaseWidget, Memory, Tree, dom, ItemFileReadStore,
           ForestStoreModel, CheckBox, FeatureLayer, ArcGISDynamicMapServiceLayer,
           ArcGISTiledMapServiceLayer, lang, topic) {
    //To create a widget, you need to derive from BaseWidget.
    return declare([BaseWidget], {
      // DemoWidget code goes here

      //please note that this property is be set by the framework when widget is loaded.
      //templateString: template,
      
      baseClass: 'jimu-widget-ServiceDirectory',
      layers: {},
      treeList: null,

      pointLayers: new Array(),
      lineLayers: new Array(),
      polygonLayers: new Array(),
      isInitialized: false,
      isClosing: false,
      treeCheckboxHandle: null,
      
      postCreate: function() {
        this.inherited(arguments);
        console.log('postCreate');
      },
      
      startup: function() {
        this.inherited(arguments);

        // read tree data file
        var store = new ItemFileReadStore({
          url: "widgets/ServiceDirectory/tree_data.json"
        });

        store.fetch({
          onComplete: lang.hitch(this, function(items) {
            items.forEach(lang.hitch(this, function(item) {
              this.fetchDataFromStore(item);
            }));
            this.addAllLayerToMap();
          })
        });
        
        var model = new ForestStoreModel({
          store: store,
          query: {"id": "*"},
          rootId: "root",
          labelAttr: "label",
          childrenAttrs: ["items"]
        });

        var MyTreeNode = declare(Tree._TreeNode, {
          _setLableAttr: {node: "labelNode", type: "innerHTML"},
          // save checkbox instance
          checkbox: null
        });

        var tree = new Tree({
          model: model,
          showRoot: false,
          _createTreeNode: function(args) {
            var tnode = new MyTreeNode(args);
            tnode.labelNode.innerHTML = args.label;

            if (args.item.root == undefined) {
              if (args.item.items == undefined) {
                var cb = new CheckBox();
                tnode.checkbox = cb;
                cb.placeAt(tnode.labelNode, "first");

                // setup onChange event
                dojo.connect(cb, "onChange", function() {
                  var treeNode = dijit.getEnclosingWidget(this.domNode.parentNode);
                  topic.publish("/checkbox/clicked", {
                    "checkbox": this,
                    "item": treeNode.item
                  });
                });
              }
            }
            
            return tnode;
          },
          // traversal all nodes
          forAllNodes: function(parentTreeNode, fun_ptr) {
            parentTreeNode.getChildren().forEach(function(n) {
              fun_ptr(n);
              if (n.getChildren().length) {
                n.tree.forAllNodes(n, fun_ptr);
              }
            });
          },
          // for change icon
          getIconClass: function(item, opened) {
            if (!item.root) {
              if (item.items != undefined) {
                return "sd-tree-group-icon";
              } else {
                return "sd-tree-layer-icon";
              }
            } else {
              return "sd-tree-group-icon";
            }
          }
        });

        var service_dir_list = dom.byId("service_dir_list");
        tree.placeAt(service_dir_list);
        tree.startup();
        this.treeList = tree;
        tree.expandAll();

        this.treeCheckboxHandle = topic.subscribe("/checkbox/clicked", lang.hitch(this, function(message) {
          console.log("you clicked: " , store.getLabel(message.item));
          var layerId = message.item.id[0];
          var layer = null;
          if (message.checkbox.checked) {
            layer = this.map.getLayer(layerId);
            layer.show();
          } else {
            if (!this.isClosing) {
              layer = this.map.getLayer(layerId);
              layer.hide();
            }
          }
        }));
        this.isInitialized = true;
        console.log('startup');
      },

      fetchDataFromStore: function(item) {
        if (item.items) {
          if (item.items.length) {
            item.items.forEach(lang.hitch(this, function(item) {
              this.fetchDataFromStore(item);
            }));
          }
        } else {
          var layerId = item.id[0];
          var layerUrl = item.url[0];
          var layerType = item.layerType[0];
          var shapeType = item.shapeType[0];

          // To create layer
          var newLayer= null;
          if (layerType == "dynamic") {
            newLayer = new ArcGISDynamicMapServiceLayer(layerUrl, {
              outField: ["*"],
              id: layerId,
              visible: false
            });
          } else if (layerType == "tiled") {
            newLayer = new ArcGISTiledMapServiceLayer(layerUrl, {
              id: layerId,
              visible: false
            });
          } else {
            console.log("unsupport layer type: " + layerType);
            return;
          }

          // Save layer to different array for adding to map
          if (shapeType == "point") {
            this.pointLayers.push(newLayer);
          } else if (shapeType == "line") {
            this.lineLayers.push(newLayer);
          } else if (shapeType == "polygon") {
            this.polygonLayers.push(newLayer);
          } else {
            console.log("unsupport shape type: " + shapeType);
            return;
          }
        }
      },

      addAllLayerToMap: function() {
        var index = 0;
        for (index = 0; index < this.polygonLayers.length; index++) {
          this.map.addLayers(this.polygonLayers);
        }
        for (index = 0; index < this.lineLayers.length; index++) {
          this.map.addLayers(this.lineLayers);
        }
        for (index = 0; index < this.pointLayers.length; index++) {
          this.map.addLayers(this.pointLayers);
        }
      },

      removeAllLayersFromMap: function() {
        var index = 0;
        for (index = 0; index < this.pointLayers.length; index++) {
          this.pointLayers[index].hide();
          this.map.removeLayer(this.pointLayers[index]);
        }
        for (index = 0; index < this.lineLayers.length; index++) {
          this.lineLayers[index].hide();
          this.map.removeLayer(this.lineLayers[index]);
        }
        for (index = 0; index < this.polygonLayers.length; index++) {
          this.polygonLayers[index].hide();
          this.map.removeLayer(this.polygonLayers[index]);
        }
      },

      onOpen: function(){
        if (this.isInitialized) {
          this.addAllLayerToMap();
        }
        this.isClosing = false;
        console.log('onOpen');
      },

      onClose: function(){
        this.isClosing = true;
        // uncheck all checked nodes
        this.treeList.forAllNodes(this.treeList.rootNode, function(node) {
           if (node.checkbox != undefined && node.checkbox.checked) {
            node.checkbox.set('checked', false);
          }
        });
        this.treeList.expandAll();
        this.removeAllLayersFromMap();
        console.log('onClose');
      },

      onMinimize: function(){
        console.log('onMinimize');
      },

      onMaximize: function(){
        console.log('onMaximize');
      },

      onSignIn: function(credential){
        /* jshint unused:false*/
        console.log('onSignIn');
      },

      onSignOut: function(){
        console.log('onSignOut');
      }
    });
  });
