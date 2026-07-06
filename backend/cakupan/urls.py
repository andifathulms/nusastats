from django.contrib import admin
from django.urls import include, path

from crawler.views import crawl_dashboard

urlpatterns = [
    path("admin/crawl/", crawl_dashboard, name="crawl_dashboard"),
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
