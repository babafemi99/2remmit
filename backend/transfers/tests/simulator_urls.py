from django.urls import include, path


urlpatterns = [
    path("api/", include("transfers.urls")),
    path("api/dev/", include("transfers.simulator_urls")),
]
