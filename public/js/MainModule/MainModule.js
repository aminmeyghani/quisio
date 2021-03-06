angular.module('MainModule', ['MainApp'])

// services
// ----------------
// service for queries and user state.
.service('Auth', function(Facebook){
  var user;
  var my = {};
  return{
    setUser : function(aUser) {user = aUser;},
    isLoggedIn : function(){return(user)? user : false;},
    setMy: function (attr, val) {my[attr] = val;},
    getMy: function (attr) {return my[attr]},
    getMe: function () {return my },
    // wrapper for calling api queries.
    runQuery: function (what, callback, options) {
      Facebook.getLoginStatus(function(response){
        if (response.status === 'connected') {
          Facebook.api(what, options, function (r){ callback(qdata = r)});
        } else if (response.status === 'not_authorized') {
          console.log("Please confirm the app so that you can connect to it")
        } else {
          console.log("Please log in to your facebook account.")
        }
      })
    },
    // Ajax in logged in user picture from the facebook account.
    setLoginPic: function (callback) {
      var thiz = this;
      Facebook.getLoginStatus(function(response){
        if (response.status === 'connected') {
          thiz.runQuery("/me/picture", function (pic) {callback( pic.data.url)});
        }
      })
    },
    // set the current path (the active page)
    getActivePage: function (location) { return location.url().substring(1, location.url().length)},
  }
})

// controllers
// -------------
// Main controller controlling the whole app. The highest level controller.
.controller("MainCtrl", [ "$scope", "$http", "Facebook", "Auth", "$rootScope", "$location", "$timeout","$route", "$routeParams", function ($scope, $http, Facebook, Auth, $rootScope, $location, $timeout, $routeParams) {
  $scope.toggle = false;
  $scope.toggleSidebar = function() {
    $scope.toggle = ! $scope.toggle;
  };

  
  // for offline testing.
  // $scope.isAppLoaded = true;
  //
  $scope.$routeParams = $routeParams;
  // get the profile info
  // checking if the Facebook wrapper is ready.
  // The facebook api is instantially asynchronously, because of that, we need to watch 
  // for the ready event. When the API is ready, then the `FB` global object is ready to go !
  // The Facebook module is a wrapper for the `FB` object.
  $scope.$watch(function() {
    return Facebook.isReady() ;
  }, function(newVal) {
      if(Facebook.isReady()) {
        // initially checks to see if the user is logged in.
        Auth.setUser(!!FB.getUserID() === true)
        $scope.isLoggedin = Auth.isLoggedIn();
        Auth.setLoginPic(function(pic) {  $scope.myPicture = (!!FB.getUserID() === true) ? ( pic) : (0)});
        // finally app is loaded.
        $scope.isAppLoaded = true;
        
      }
  });

  // Control for authentication routing. Let users go to dashboard only if they are logged in.
  $scope.$watch(Auth.isLoggedIn, function (value, oldValue) {
    if(!value && oldValue) { $location.path('/')}
    // if(value) { $location.path("/dashboard")  }
  }, true);


  // Everytime route changes test and see if we are on the homepage.
    $rootScope.$on('$routeChangeStart', function () {
      $scope.isHome = ($location.url() == "/") ? (true) : (false);  
    });
    // checking on routeprams
    $scope.$on('$routeChangeSuccess', function() {
      // set the active page.
      $scope.activePage = Auth.getActivePage($location);
      // get the name of the logged in user.
      Auth.runQuery("/me", function(res){ $scope.firstName  = res.first_name });
    });
}])
// Higher level controller for the dashboard.
.controller("LibraryCtrl", [ "$rootScope","$scope", "$http", "$q", "Facebook", "Auth", "$timeout", "$cookies", function ($rootScope, $scope, $http, $q, Facebook, Auth, $timeout, $cookies) {

  // msg dismissed
  $scope.isDismissed = false;
  
  $scope.$watch(function() { return $cookies.test;}, function(newValue) {
       console.log('Cookie string: ' + $cookies.test)
       $scope.isDismissed = $cookies.test;
   });

   

   $scope.showMsg = function () {
    $timeout(function () {
        $cookies.test = '';
    }, 500);
   }

   $scope.dismiss = function () {
    $timeout(function () {
        $cookies.test = 'third value';
    }, 250);    
   }

  // getting the books
  $scope.isBooksReady = false;
  // ajax call to get the books from MYSQL through express REST API
  $q.all([$http({method: "GET",url: "/books"})
  ]).then(function(response) {$scope.books = response[0].data; $timeout(function () {$scope.isBooksReady = true},500)});
    
  // get list of my facebook friends.
  Auth.runQuery("/me", function(d){ $scope.me = d});

  // get list of friends.
  Auth.runQuery("/me/friends", function(d){ $scope.myFriends = d.data});

  // get friends books.
  $scope.rawFriendsData = [];
  Auth.runQuery("/me/friends", function(friends){ 
    friends.data.forEach(function (f) {
      Auth.runQuery("/"+f.id+"/books", function(books){ 
        books.data.forEach(function (b) {
          Auth.runQuery("/"+b.id, function(page){ 
            Auth.runQuery("/"+f.id+"/picture", function (friendPicture) {
              $scope.rawFriendsData.push({
                book: {data: b, bookPage: page},
                friend: {data:f, picURL: friendPicture.data.url},
              });
              var mydata = _.groupBy($scope.rawFriendsData, function (x) {return x.friend.data.id} );
              $scope.mainData = [];
              // organize data for display. returns -> 
              /*
                [
                  { friend: FRIEND_OBJ, books: [ BOOK_OBJ, BOOK_OBJ, BOOK_OBJ] }, 
                  { ... },
                  { ... }
                ]
              */
              for (var v in mydata) {
                $scope.mainData.push(
                  { friend: mydata[v][0].friend, books: mydata[v].map(function (y) {return y.book} ) }
                );
              }
            }, {"redirect": false, "width": 500});
          })
        });
      })
    });
  });
  
  // ajax call to get my facebook photo.
  $scope.getPhoto = function() {
    $q.all([$http({method: "GET",url: "http://graph.facebook.com/322331021276495/photos"})
      ]).then(function(response) {
        $scope.photos = response[0].data;
      })
    }

    // ask permission for accessing user likes
    // see what your friends are up to ...
    $scope.askForLikes = function () {
      FB.login(function(response) {
      }, {scope: 'email,user_likes,user_friends'});
    };

    // book table pagination
    $scope.currentPage = 1;
    $scope.pageSize = 10;
    $scope.noButtonsVisible = 3;
    // book filter
    $scope.author = { name: "" };
    $scope.bookFilter = function (b) {
      return b.author.toLowerCase().indexOf($scope.author.name.toLowerCase()) !== -1;
    };
  
 }])

.controller('LoginCtrl', [ '$scope', 'Auth','Facebook','$location', function ($scope, Auth, Facebook, $location) {
  // login handler for facebook.
  $scope.loginWithFB = function () {
    Facebook.login(function(response) {
      if (response.status == 'connected') {
        // when connected, set the service value to true.
        Auth.setUser(true);
        // ask the state of the user from Auth.
        $scope.isLoggedin = Auth.isLoggedIn();
        Auth.setLoginPic(function(pic) {$scope.myPicture = pic; });


        // redirect to dashboard on login.
        $location.url("/library")
      } else {
        // log in wasn't successful ...
        Auth.setUser(false);
        $scope.isLoggedin = Auth.isLoggedIn();
        $scope.myPicture = 0;
      }
    });
  };
  // logout the user from the app (and facebook)
  $scope.logout = function () {
    console.log("logiing out", FB.getAccessToken());
    Facebook.logout(function(response) {
      console.log("logged out");
      Auth.setUser(false);
      $scope.isLoggedin = Auth.isLoggedIn();
      $scope.myPicture = 0;
      $location.url("/");
    });
  };
}])

// Profile.
.controller("ProfileCtrl",["$scope", "Auth", function ($scope, Auth) {
  Auth.runQuery("/me", function(res){ $scope.me  = res });
}])

// books
.controller("BooksCtrl",["$scope", "Auth", "$q","$http","$timeout", function ($scope, Auth, $q, $http, $timeout) {
  // Getting the list of books asynchronously by calling the REST API from MYSQL
    // Express takes care of the rest after the SQL query is run with node.
    $scope.isBooksReady = false;
    $q.all([$http({method: "GET",url: "/books"})
    ]).then(function(response) {$scope.books = response[0].data; $timeout(function () {$scope.isBooksReady = true},500)});
}])

// Directives
// -------------
.directive('icon', [ function () {
    return {
    scope:{glyph: "@icon", place: "@place"}, 
    restrict: "A",
    transclude: true,
    template : "<span class='glyphicon-{{glyph}} {{place}}' ng-transclude></span>",
    link:function(scope, element, attrs) {}
  };
}])

.directive('tip', function() { return function(scope, element, attrs) {
  $(element).tooltip({placement: attrs.placement,title:function(){return $(element).attr('tip')}});
}})

// full height
.directive('fullheight', [ "$timeout", function($timeout) {
   return function(scope, element, attrs) {
    $timeout(function() {
      var windowH = $(window).height();
      var wrapperH = $(element).height();
      if(windowH > wrapperH) {                            
          $(element).css({'height':($(window).height()- attrs.h || 300)+'px'});
      }                                                                               
    },1000);
    $(window).resize(function(){
        var windowH = $(window).height();
        var wrapperH = $(element).height();
        var differenceH = windowH - wrapperH;
        var newH = wrapperH + differenceH;
        var truecontentH = $(element).find('js-scroll-inner').height();
        if(windowH > truecontentH) {
            $(element).css('height', (newH -  attrs.h || 300)+'px');
        }

    }) 
  }
}])

// scrollbar
.directive('scroller', function() { return function(scope, element, attrs) {
  $(element).perfectScrollbar({wheelSpeed : 20});
}})

// filters
// ------------
.filter('paginate', function() {
  return function(d, start, pageSize, skipFilter) {
    if (!d || skipFilter) return d;
    start = +start;
    start--;
    pageSize = +pageSize;
    return  d.slice(start*pageSize, (start*pageSize)+pageSize);
  };
})