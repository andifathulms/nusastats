from django.contrib import admin

from .models import PetaIndicator, PetaLoadLog, PetaRegion, PetaSourceFile, PetaValue

admin.site.register(PetaLoadLog)
admin.site.register(PetaSourceFile)
admin.site.register(PetaIndicator)
admin.site.register(PetaRegion)
admin.site.register(PetaValue)
